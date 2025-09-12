'use client'

import { useContext, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AztecWalletSdk, obsidion } from '@nemi-fi/wallet-sdk'
import { useAccount } from '@nemi-fi/wallet-sdk/react'
import { APP_MODE, CHAIN_ID, NODE_URL, OBSIDION_WALLET_URL, TESTNET_NODE_URL } from '@/constants'
import { Button } from './ui/button'
import WalletMenu from './wallet/WalletMenu'
import { AzguardRpcClient, DappPermissions, DappMetadata } from '@azguardwallet/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Badge } from './ui/badge'
import { GlobalContext } from '@/contexts/GlobalContext'

type BuildConnectionParamsType = {
  dappMetadata: DappMetadata
  requiredPermissions: DappPermissions[]
}

const buildConnectionParams = (): BuildConnectionParamsType => {
  return {
    dappMetadata: {
      name: 'Aztec Starter',
      description:
        'A modern Next.js starter template with Aztec integration for building web3 applications',
      logo: 'https://somestaffspace.fra1.digitaloceanspaces.com/logo.png',
      url: 'https://azguardwallet.io/',
    },
    requiredPermissions: [
      {
        chains: [`aztec:${CHAIN_ID}`],
        methods: [
          'register_contract',
          'send_transaction',
          'call',
          'simulate_utility',
          'add_capsule',
        ],
        events: [],
      },
    ],
  }
}

export const sdk = new AztecWalletSdk({
  aztecNode: NODE_URL,
  connectors: [obsidion({ walletUrl: OBSIDION_WALLET_URL })],
})

export const Header = () => {
  const {
    setWalletName,
    setWalletAddress,
    walletAddress,
    setAzguardAccount,
    azguardAccount,
    azguardSessionId,
    setAzguardSessionId,
    azguardClient,
    setAzguardClient,
  } = useContext(GlobalContext)
  const [isConnecting, setIsConnecting] = useState(false)

  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false)
  const obsidionAccount = useAccount(sdk)
  const obsidionAddress = obsidionAccount?.address?.toString() || ''

  // const [azguardAccount, setAzguardAccount] = useState('')
  const [azguardAddress, setAzguardAddress] = useState<string | undefined>('')

  const handleConnectObsidion = async () => {
    try {
      setIsConnecting(true)
      setIsWalletDialogOpen(false)
      const account = await sdk.connect('obsidion')
      setWalletName!('obsidion')
      setWalletAddress!(account.address.toString())
    } catch (error) {
      console.error('Failed to Connect to Obsidion wallet', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleConnectAzguard = async () => {
    try {
      setIsConnecting(true)
      setIsWalletDialogOpen(false)
      if (window.azguard) {
        const azguard = window.azguard.createClient() as AzguardRpcClient
        setAzguardClient!(azguard)

        const sessionValue = await azguard.request('connect', buildConnectionParams())
        if (sessionValue?.id) {
          setAzguardSessionId!(sessionValue.id)
          const accounts = sessionValue?.accounts || []
          setAzguardAccount!(accounts[0])
          const address = accounts[0].split(':').at(-1) || ''
          setWalletName!('azguard')
          setWalletAddress!(address)
          setAzguardAddress(address)
        }
      }
    } catch (err) {
      console.log('ERROR CONNECTION AZGUARD', err)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await sdk.disconnect()
      setAzguardAddress(undefined)
      setAzguardAccount!('')
      setAzguardSessionId!('')
      setAzguardClient!(null)
      setWalletName!('')
      setWalletAddress!('')
    } catch (error) {
      console.error('Failed to Disconnect wallet', error)
    }
  }

  useEffect(() => {
    if (obsidionAccount?.address && walletAddress === '') {
      setWalletAddress!(obsidionAccount.address.toString())
      setWalletName!('obsidion')
    }
  }, [obsidionAccount])

  return (
    <div className="p-2">
      <div className="flex items-center justify-between">
        <div>Aztec Starter</div>
        <Badge variant="secondary" className="px-4 py-2">
          {APP_MODE}
        </Badge>
        {azguardAddress || obsidionAddress ? (
          <WalletMenu
            accountAddress={azguardAddress || obsidionAddress}
            handleDisconnect={handleDisconnect}
          />
        ) : (
          <>
            <Button onClick={() => setIsWalletDialogOpen(true)} disabled={isConnecting}>
              <span className="relative z-10 flex items-center">
                {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect Wallet
              </span>
            </Button>

            <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Connect Wallet</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                  <Button
                    onClick={handleConnectAzguard}
                    className="w-full justify-start"
                    disabled={isConnecting}
                  >
                    <img
                      src="assets/azguard-logo.png"
                      alt="Azguard"
                      className="mr-2 h-5 w-5"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    Azguard
                  </Button>
                  <Button
                    onClick={handleConnectObsidion}
                    className="w-full justify-start"
                    disabled={isConnecting}
                  >
                    <img
                      src="assets/obsidion-logo.svg"
                      alt="Obsidion"
                      className="mr-2 h-5 w-5"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    Obsidion
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  )
}
