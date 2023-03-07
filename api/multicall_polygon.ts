import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
    Multicall,
    ContractCallContext,
    ContractCallResults,
} from "ethereum-multicall";
import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";
import { PrismaClient } from "@prisma/client";
import { verifySignature } from "@upstash/qstash/nextjs";
import IChamberV1ABI from "../abis/IChamberV1.json";

const POOLS = [
    // MATIC - LINK
    "0x8E756cAad37136Df14Eb42Dc4BCb211D4aFC3E5B",
    // MATIC - CRV
    "0x8d342020D9e452e129B4C40a7e1d754e1d1b124f",
    // LINK - ETH
    "0xaBFe2C02c1dbE04672de1e330b17288116945a67",
];

async function handler(req: VercelRequest, resp: VercelResponse) {
    const RPC_ENDPOINT = process.env.POLYGON_RPC_ENDPOINT ?? "";

    try {
        const dbClient = new PrismaClient();
        const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
        const multicall = new Multicall({ nodeUrl: RPC_ENDPOINT });

        const callContext: ContractCallContext[] = POOLS.map((address) => {
            return {
                reference: address,
                contractAddress: address,
                abi: IChamberV1ABI,
                calls: [
                    {
                        reference: "get_s_totalSharesCall",
                        methodName: "get_s_totalShares",
                        methodParameters: [],
                    },
                    {
                        reference: "currentUSDBalanceCall",
                        methodName: "currentUSDBalance",
                        methodParameters: [],
                    },
                ],
            };
        });

        const callContextResults: ContractCallResults = await multicall.call(
            callContext
        );

        const poolsResults = [];
        for (const address of POOLS) {
            const callContextReturns =
                callContextResults.results[address].callsReturnContext;

            const blockNumber = callContextResults.blockNumber;
            const block = await provider.getBlock(blockNumber, false);
            const blockTimestamp = block ? block.timestamp : 0;
            const totalShares = new BigNumber(
                callContextReturns[0].returnValues[0].hex
            );
            const currentUsdBalance = new BigNumber(
                callContextReturns[1].returnValues[0].hex
            );

            poolsResults.push({
                address: address,
                block: blockNumber,
                blockTime: new Date(blockTimestamp * 1e3),
                totalShares: totalShares.toString(),
                currentUsdBalance: currentUsdBalance.toString(),
            });
        }

        const pools = await dbClient.polygonPool.createMany({
            data: poolsResults,
        });

        resp.status(200).json({
            pools,
        });
    } catch (error: any) {
        resp.status(500).json({
            error: error.toString(),
        });
    }
}

export default verifySignature(handler);
