'use client'
import { useContext, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Vote, CheckCircle, AlertCircle, Key } from 'lucide-react'
import { GlobalContext } from '@/contexts/GlobalContext'
import { getContractInstanceFromDeployParams, Fr, AztecAddress } from '@aztec/aztec.js'
import { OkResult } from '@azguardwallet/types'
import { Contract } from '@nemi-fi/wallet-sdk/eip1193'
import { useAccount } from '@nemi-fi/wallet-sdk/react'
import { sdk } from '@/components/Header'
import { TIMEOUT } from '@/constants'
import { EasyPrivateVotingContract } from '../artifacts/EasyPrivateVoting'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NodeInfo } from '@/components/NodeInfo'
import { getDeployContractBatchCalls } from '@/components/register-contract-azguard'
import { getDeployContractBatchCallsForAlreadyRegistered } from '@/components/deploy-already-registered'
import { validateAddress } from '@/lib/utils'

const CONTRACT_ADDRESS_SALT = Fr.fromString('13')

class EasyPrivateVoting extends Contract.fromAztec(EasyPrivateVotingContract) {}

export default function Home() {
  const { walletAddress, walletName, azguardAccount, azguardSessionId, azguardClient } =
    useContext(GlobalContext)
  const account = useAccount(sdk)
  const [isDeploying, setIsDeploying] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [deployStatus, setDeployStatus] = useState({ success: false, error: false, txHash: '' })
  const [adminAddress, setAdminAddress] = useState('')
  const [adminAddressError, setAdminAddressError] = useState('')
  const [contractAddress, setContractAddress] = useState<AztecAddress | null>(null)
  const [isCastingVote, setIsCastingVote] = useState(false)
  const [isEndingVote, setIsEndingVote] = useState(false)
  const [isCheckingVotes, setIsCheckingVotes] = useState(false)
  const [voteCount, setVoteCount] = useState(0)
  const [isVoteEnded, setIsVoteEnded] = useState(false)

  const getVotingContract = async (): Promise<Contract<EasyPrivateVotingContract> | null> => {
    if (!account) {
      toast.error('Please connect wallet first')
      return null
    }
    try {
      const address = contractAddress || (await computeContractAddress(account))
      if (!address) {
        toast.error('Please deploy contract first')
        return null
      }
      const votingContract = await EasyPrivateVoting.at(address, account)
      return votingContract
    } catch (err) {
      console.error('Error getting voting contract:', err)
      toast.error('Failed to connect to contract')
      return null
    }
  }

  const handleAdminAddressChange = (e: { target: { value: any } }) => {
    const value = e.target.value
    setAdminAddress(value)
    setAdminAddressError(validateAddress(value))
  }

  // Unified contract registration handler
  const handleRegisterContract = async () => {
    if (!walletName) {
      toast.error('Please connect a wallet first')
      return
    }
    setIsRegistering(true)
    try {
      if (walletName === 'obsidion') {
        await handleRegisterContractObsidion()
      } else if (walletName === 'azguard') {
        await handleRegisterContractAzguard()
      }
    } catch (error) {
      console.error('Registration error:', error)
      toast.error('Failed to register contract class')
    } finally {
      setIsRegistering(false)
    }
  }

  const handleDeployContract = async () => {
    const error = validateAddress(adminAddress)
    if (error) {
      setAdminAddressError(error)
      return
    }

    if (!walletName) {
      toast.error('Please connect a wallet first')
      return
    }

    setIsDeploying(true)
    setDeployStatus({ success: false, error: false, txHash: '' })

    try {
      if (walletName === 'obsidion') {
        await handleObsidionDeploy()
      } else if (walletName === 'azguard') {
        await handleAzguardDeploy()
      }
    } catch (error) {
      console.error('Deployment error:', error)
      setDeployStatus({
        success: false,
        error: true,
        txHash: '',
      })
      toast.error('Failed to deploy contract')
    } finally {
      setIsDeploying(false)
    }
  }

  const handleRegisterContractObsidion = async () => {
    if (!account) {
      toast.error('Obsidion account not connected')
      return
    }

    toast.info('Registering contract class...')

    const contractInstance = await getContractInstanceFromDeployParams(
      EasyPrivateVotingContract.artifact,
      {
        salt: CONTRACT_ADDRESS_SALT,
        constructorArgs: [account.getAddress()],
        deployer: account.getAddress(),
      }
    )
    console.log('Contract address to be registered', contractInstance.address.toString())

    const txn = await account
      ?.sendTransaction({
        calls: [],
        registerContracts: [
          {
            address: contractInstance.address,
            instance: contractInstance,
            artifact: EasyPrivateVoting.artifact,
          },
        ],
      })
      .wait({ timeout: TIMEOUT.HIGH })
    console.log('Register contract call', txn?.txHash.toString())

    toast.success('Contract class registered successfully')
  }

  const handleObsidionDeploy = async () => {
    if (!account) {
      toast.error('Obsidion account not connected')
      return
    }

    const contractInstance = await getContractInstanceFromDeployParams(
      EasyPrivateVotingContract.artifact,
      {
        salt: CONTRACT_ADDRESS_SALT,
        constructorArgs: [account.getAddress()],
        deployer: account.getAddress(),
      }
    )

    console.log('Contract instance to be deployed', contractInstance.address.toString())

    const deployTx = await EasyPrivateVoting.deployWithOpts(
      {
        account: account,
        skipClassRegistration: true,
        publicKeys: contractInstance.publicKeys,
        method: 'constructor',
      },
      account.getAddress()
    )
      .send()
      .wait({ timeout: TIMEOUT.HIGH })
    console.log('deploy TX', deployTx)

    setContractAddress(deployTx.contract.address)
    setDeployStatus({
      success: true,
      error: false,
      txHash: deployTx.txHash.toString() || 'Transaction submitted',
    })
    toast.success('Contract deployed successfully!')
  }

  // Azguard specific registration
  const handleRegisterContractAzguard = async () => {
    if (!azguardClient) {
      toast.error('Azguard client is not initialized')
      return
    }

    if (!azguardAccount || !azguardSessionId) {
      toast.error('Azguard account not found')
      return
    }

    toast.info('Registering contract class...')

    const executeParams = await getDeployContractBatchCalls({
      account: azguardAccount,
      sessionId: azguardSessionId,
    })
    console.log('Execute Params for Registration', executeParams)
    const results = await azguardClient.request('execute', executeParams as any)
    console.log('Registration Results', results)

    if (Array.isArray(results) && results.every((result: any) => result.status === 'ok')) {
      toast.success('Contract class registered successfully')
    } else {
      throw new Error('Registration failed - not all operations completed successfully')
    }
  }

  // Azguard specific deployment
  const handleAzguardDeploy = async () => {
    if (!azguardClient) {
      toast.error('Azguard client is not initialized')
      return
    }

    if (!azguardAccount || !azguardSessionId) {
      toast.error('Azguard account not found')
      return
    }

    const {
      sessionId,
      operations,
      contractAddress: deployedContractAddress,
    } = await getDeployContractBatchCallsForAlreadyRegistered({
      account: azguardAccount,
      address: walletAddress,
      sessionId: azguardSessionId,
    })

    const executeParams = { sessionId, operations }
    console.log('Execute Params for Deployment', executeParams)
    console.log('Contract address to be deployed:', deployedContractAddress.toString())

    const results = await azguardClient.request('execute', executeParams as any)
    console.log('Deployment Results', results)

    if (Array.isArray(results) && results.every((result) => result.status === 'ok')) {
      // Extract transaction hash from the result
      const deploymentResult = results.find((result: OkResult<any>) => result.result)
      const txHash = (deploymentResult?.result as string) || 'Transaction submitted via Azguard'

      if (txHash) {
        setContractAddress(deployedContractAddress)
        setDeployStatus({
          success: true,
          error: false,
          txHash: txHash,
        })
        toast.success('Contract deployed successfully!')
      }
    } else {
      throw new Error('Deployment failed - not all operations completed successfully')
    }
  }

  const handleCastVote = async () => {
    setIsCastingVote(true)

    try {
      const votingContract = await getVotingContract()
      if (!votingContract) return

      // Cast vote for option 1
      const tx = await votingContract.methods.cast_vote(1).send().wait({ timeout: TIMEOUT.HIGH })

      console.log('Vote cast transaction:', tx)

      toast.success('Vote cast successfully!')

      // Check the updated vote count
      await handleCheckVotes()
    } catch (err) {
      console.error('Error casting vote:', err)
      toast.error('Failed to cast vote')
    } finally {
      setIsCastingVote(false)
    }
  }

  const handleEndVote = async () => {
    setIsEndingVote(true)

    try {
      const votingContract = await getVotingContract()
      if (!votingContract) return

      const tx = await votingContract.methods.end_vote().send().wait({ timeout: TIMEOUT.HIGH })

      console.log('End vote transaction:', tx)

      setIsVoteEnded(true)
      toast.success('Voting has ended successfully')
    } catch (err) {
      console.error('Error ending vote:', err)
      toast.error('Failed to end voting')
    } finally {
      setIsEndingVote(false)
    }
  }

  const handleCheckVotes = async () => {
    setIsCheckingVotes(true)

    try {
      const votingContract = await getVotingContract()
      if (!votingContract) return

      const count = await votingContract.methods.get_vote(1).simulate()
      setVoteCount(Number(count))
      toast.success(`Current vote count for option 1: ${count}`)
    } catch (err) {
      console.error('Error checking votes:', err)
      toast.error('Failed to check votes')
    } finally {
      setIsCheckingVotes(false)
    }
  }

  const handleCastVoteFromAzguard = async () => {
    if (!azguardClient) {
      toast.error('Azguard client is not initialized')
      return
    }

    setIsCastingVote(true)

    try {
      const executeParams = {
        sessionId: azguardSessionId,
        operations: [
          {
            kind: 'send_transaction',
            account: azguardAccount,
            actions: [
              {
                kind: 'call',
                contract: contractAddress,
                method: 'cast_vote',
                args: [1],
              },
            ],
          },
        ],
      }

      const results = await azguardClient.request('execute', executeParams as any)
      console.log('Cast vote results:', results)

      if (Array.isArray(results) && results.length > 0 && results[0].status === 'ok') {
        const txHash = results[0].result
        console.log('Vote cast transaction:', txHash)

        toast.success('Vote cast successfully!')

        await handleUnifiedCheckVotes()
      } else {
        throw new Error('Transaction failed - unexpected response from Azguard')
      }
    } catch (err) {
      console.error('Error casting vote:', err)
      toast.error('Failed to cast vote')
    } finally {
      setIsCastingVote(false)
    }
  }

  const handleEndVoteFromAzguard = async () => {
    if (!azguardClient) {
      toast.error('Azguard client is not initialized')
      return
    }

    setIsEndingVote(true)

    try {
      const executeParams = {
        sessionId: azguardSessionId,
        operations: [
          {
            kind: 'send_transaction',
            account: azguardAccount,
            actions: [
              {
                kind: 'call',
                contract: contractAddress,
                method: 'end_vote',
                args: [],
              },
            ],
          },
        ],
      }

      const results = await azguardClient.request('execute', executeParams as any)
      console.log('End vote results:', results)

      if (Array.isArray(results) && results.length > 0 && results[0].status === 'ok') {
        const txHash = results[0].result
        console.log('End vote transaction:', txHash)

        setIsVoteEnded(true)
        toast.success('Voting has ended successfully')
      } else {
        throw new Error('Transaction failed - unexpected response from Azguard')
      }
    } catch (err) {
      console.error('Error ending vote:', err)
      toast.error('Failed to end voting')
    } finally {
      setIsEndingVote(false)
    }
  }

  const handleCheckVotesFromAzguard = async () => {
    if (!azguardClient) {
      toast.error('Azguard client is not initialized')
      return
    }

    setIsCheckingVotes(true)

    try {
      const executeParams = {
        sessionId: azguardSessionId,
        operations: [
          {
            kind: 'simulate_utility',
            account: azguardAccount,
            contract: contractAddress,
            method: 'get_vote',
            args: [1],
          },
        ],
      }

      const results = await azguardClient.request('execute', executeParams as any)
      console.log('Check votes results:', results)

      if (Array.isArray(results) && results.length > 0 && results[0].status === 'ok') {
        const count = results[0].result
        const voteCountNumber = Number(count)

        setVoteCount(voteCountNumber)
        toast.success(`Current vote count for option 1: ${voteCountNumber}`)
      } else {
        throw new Error('Simulation failed - unexpected response from Azguard')
      }
    } catch (err) {
      console.error('Error checking votes:', err)
      toast.error('Failed to check votes')
    } finally {
      setIsCheckingVotes(false)
    }
  }

  const handleUnifiedCastVote = async () => {
    if (walletName === 'obsidion') {
      await handleCastVote()
    } else if (walletName === 'azguard') {
      await handleCastVoteFromAzguard()
    } else {
      toast.error('Unsupported wallet type')
    }
  }

  const handleUnifiedCheckVotes = async () => {
    if (walletName === 'obsidion') {
      await handleCheckVotes()
    } else if (walletName === 'azguard') {
      await handleCheckVotesFromAzguard()
    } else {
      toast.error('Unsupported wallet type')
    }
  }

  const handleUnifiedEndVote = async () => {
    if (walletName === 'obsidion') {
      await handleEndVote()
    } else if (walletName === 'azguard') {
      await handleEndVoteFromAzguard()
    } else {
      toast.error('Unsupported wallet type')
    }
  }

  if (!walletAddress) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Card className="w-full max-w-md border-border bg-gradient-to-b from-card to-background shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-primary">Easy Private Voting</CardTitle>
            <CardDescription>
              Connect your wallet to deploy a private voting contract
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Alert
              variant="destructive"
              className="border-muted bg-secondary/20"
            >
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">Wallet Required</AlertTitle>
              <AlertDescription>
                Please connect your wallet using the button in the header to continue.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border bg-gradient-to-b from-card to-background shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl flex items-center gap-2">
                <Vote className="h-6 w-6 text-primary" />
                Easy Private Voting
              </CardTitle>
              {isVoteEnded && (
                <span className="px-2 py-1 bg-red-500/20 text-red-500 rounded-full text-xs">
                  Voting Ended
                </span>
              )}
            </div>
            <CardDescription>Deploy a private voting contract on Aztec Network</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="p-4 rounded-lg border border-border bg-secondary/10">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-muted-foreground">Connected Wallet</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-foreground">{walletAddress}</span>
                  <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded capitalize">
                    {walletName}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="admin-address"
                className="text-sm font-medium text-primary flex items-center gap-2"
              >
                <Key className="h-4 w-4" /> Admin Address
              </Label>
              <Input
                id="admin-address"
                type="text"
                value={adminAddress}
                onChange={handleAdminAddressChange}
                placeholder="0x..."
                className={`font-mono ${
                  adminAddressError ? 'border-destructive' : 'border-border'
                }`}
              />
              {adminAddressError && (
                <p className="text-xs text-destructive mt-1">{adminAddressError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                This address will have admin privileges in the voting contract. By default, your
                current wallet address is used.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium text-primary">About Private Voting</h3>
              <p className="text-muted-foreground text-sm">
                This contract allows for private voting where votes are encrypted and tallied
                without revealing individual choices. Perfect for DAOs, communities, and
                organizations that value privacy.
              </p>
            </div>

            {contractAddress && (
              <div className="p-4 rounded-lg border border-border bg-secondary/10">
                <div className="flex flex-col space-y-1">
                  <span className="text-sm font-medium text-muted-foreground">
                    Contract Address
                  </span>
                  <span className="font-mono text-sm text-foreground break-all">
                    {contractAddress.toString()}
                  </span>
                </div>
              </div>
            )}

            {voteCount > 0 && (
              <Alert className="border-chart-2/30 bg-secondary/10">
                <CheckCircle className="h-4 w-4 text-chart-2" />
                <AlertTitle className="text-chart-2">Current Vote Count: {voteCount}</AlertTitle>
                <AlertDescription>The current number of votes cast for option 1.</AlertDescription>
              </Alert>
            )}

            {deployStatus.success && (
              <Alert className="border-chart-2/30 bg-secondary/10">
                <CheckCircle className="h-4 w-4 text-chart-2" />
                <AlertTitle className="text-chart-2">Deployment Successful</AlertTitle>
                <AlertDescription className="font-mono text-xs break-all text-muted-foreground">
                  Transaction Hash: {deployStatus.txHash}
                </AlertDescription>
              </Alert>
            )}

            {deployStatus.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Deployment Failed</AlertTitle>
                <AlertDescription>
                  There was an error deploying your contract. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex flex-wrap gap-4">
            {!contractAddress ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleRegisterContract}
                  disabled={isRegistering}
                  className="flex-1"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    'Register Contract Class'
                  )}
                </Button>
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={handleDeployContract}
                  disabled={isDeploying}
                >
                  {isDeploying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deploying Contract...
                    </>
                  ) : (
                    'Deploy Voting Contract'
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleUnifiedCastVote}
                  disabled={isCastingVote || isVoteEnded}
                  className="flex-1"
                >
                  {isCastingVote ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Casting Vote...
                    </>
                  ) : (
                    'Cast Vote (Option 1)'
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleUnifiedCheckVotes}
                  disabled={isCheckingVotes}
                  className="flex-1"
                >
                  {isCheckingVotes ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Check Votes'
                  )}
                </Button>

                <Button
                  variant="destructive"
                  onClick={handleUnifiedEndVote}
                  disabled={isEndingVote || isVoteEnded}
                  className="flex-1"
                >
                  {isEndingVote ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Ending Vote...
                    </>
                  ) : (
                    'End Voting'
                  )}
                </Button>
              </>
            )}
          </CardFooter>
        </Card>

        <div className="lg:col-span-1">
          <NodeInfo />
        </div>
      </div>
    </div>
  )
}

const computeContractAddress = async (account: any) => {
  try {
    const contractInstance = await getContractInstanceFromDeployParams(
      EasyPrivateVotingContract.artifact,
      {
        salt: CONTRACT_ADDRESS_SALT,
        constructorArgs: [account.getAddress()],
        deployer: account.getAddress(),
      }
    )

    return contractInstance.address
  } catch (err) {
    console.error('Error computing contract address:', err)
    return null
  }
}
