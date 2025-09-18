import { EasyPrivateVotingContract } from "@/artifacts/EasyPrivateVoting";
import { PXE } from "@aztec/aztec.js";
import { setupWallets } from "./utils";
import { Logger } from "@/lib/Logger";

export const deployVotingContract = async (pxe: PXE) => {
  const wallets = await setupWallets(pxe);
  const votingContract = await EasyPrivateVotingContract.deploy(wallets.owner, wallets.owner.getAddress()).send().deployed();

  Logger.success(`Voting contract deployed on address ${votingContract.address.toString()}`);
  return { votingContract, wallets };
};

export const castVotehandler = async (pxe: PXE, candidateId: number) => {
  const { votingContract, wallets } = await deployVotingContract(pxe);
  const castVoteTxn = await votingContract.methods.cast_vote(candidateId).send().wait();

  Logger.success(`Vote casted successfully to candidate ${candidateId}. txn hash: ${castVoteTxn.txHash.toString()} `);
};

export const getVoteHandler = async (pxe: PXE, candidateId: number) => {
  const { votingContract, wallets } = await deployVotingContract(pxe);
  const voteCount = await votingContract.methods.get_vote(candidateId).simulate();
  Logger.success(`Vote count per candidate ${candidateId}. txn hash: ${voteCount.toString()} `);
};

export const endVoteHandler = async (pxe: PXE) => {
  const { votingContract, wallets } = await deployVotingContract(pxe);
  const endvote = await votingContract.methods.end_vote().send().wait();
  Logger.success(`Vote count per candidate ${endvote}. txn hash: ${endvote.toString()} `);
};
