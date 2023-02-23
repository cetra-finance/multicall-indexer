import type { VercelRequest, VercelResponse } from "@vercel/node";

export default (req: VercelRequest, resp: VercelResponse) => {
    resp.status(200).send("Hello!");
};
