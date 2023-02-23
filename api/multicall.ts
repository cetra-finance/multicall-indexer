import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
    Multicall,
    ContractCallContext,
    ContractCallResults,
} from "ethereum-multicall";
import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";
import { PrismaClient } from "@prisma/client";
import ChamberV1ABI from "../abis/ChamberV1.json";

export default async (req: VercelRequest, resp: VercelResponse) => {
    const RPC_ENDPOINT = process.env.RPC_ENDPOINT ?? "";
    const POOL_ADDRESS = process.env.POOL_ADDRESS ?? "";

    try {
        const dbClient = new PrismaClient();
        const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
        const multicall = new Multicall({ nodeUrl: RPC_ENDPOINT });

        const callContext: ContractCallContext[] = [
            {
                reference: POOL_ADDRESS,
                contractAddress: POOL_ADDRESS,
                abi: ChamberV1ABI,
                calls: [
                    {
                        reference: "s_totalSharesCall",
                        methodName: "s_totalShares",
                        methodParameters: [],
                    },
                    {
                        reference: "currentUSDBalanceCall",
                        methodName: "currentUSDBalance",
                        methodParameters: [],
                    },
                ],
            },
        ];

        const callContextResults: ContractCallResults = await multicall.call(
            callContext
        );
        const callContextReturns =
            callContextResults.results[POOL_ADDRESS].callsReturnContext;

        const blockNumber = callContextResults.blockNumber;
        const block = await provider.getBlock(blockNumber, false);
        const blockTimestamp = block ? block.timestamp : 0;
        const totalShares = new BigNumber(
            callContextReturns[0].returnValues[0].hex
        );
        const currentUsdBalance = new BigNumber(
            callContextReturns[1].returnValues[0].hex
        );

        const pools = await dbClient.pools.create({
            data: {
                address: POOL_ADDRESS,
                block: blockNumber,
                blockTime: new Date(blockTimestamp * 1e3),
                totalShares: totalShares.toString(),
                currentUsdBalance: currentUsdBalance.toString(),
            },
        });

        resp.status(200).json({
            pools,
        });
    } catch (error: any) {
        resp.status(500).json({
            error: error.toString(),
        });
    }
};
