import cors from "cors"
import { config as dotenvConfig } from "dotenv"
import { Contract, providers, utils, Wallet } from "ethers"
import express from "express"
import https from "https"
import { resolve } from "path"
import fs from 'fs'
import { abi as contractAbi } from "../contracts/build/contracts/contracts/resistence.sol/resistence.json"
import { IStringBallot, stringBallot } from "../utils/ballot"
import { stringIsNullOrEmpty } from '../utils/utils.js'

dotenvConfig({ path: resolve(__dirname, "../../.env") })

if (typeof process.env.CONTRACT_ADDRESS !== "string") {
    throw new Error("Please, define CONTRACT_ADDRESS in your .env file")
}

if (typeof process.env.ETHEREUM_URL !== "string") {
    throw new Error("Please, define ETHEREUM_URL in your .env file")
}

if (typeof process.env.ETHEREUM_PRIVATE_KEY !== "string") {
    throw new Error("Please, define ETHEREUM_PRIVATE_KEY in your .env file")
}

if (typeof process.env.RELAY_URL !== "string") {
    throw new Error("Please, define RELAY_URL in your .env file")
}

const ethereumPrivateKey = process.env.ETHEREUM_PRIVATE_KEY
const ethereumURL = process.env.ETHEREUM_URL
const contractAddress = process.env.CONTRACT_ADDRESS
const { port } = new URL(process.env.RELAY_URL)

let eventKeys = new Map<string, any[]>()
let publicVoteMappings = new Map()

const app = express()
// config relay to use https, 
let keyDir = process.argv[2]
let certDir = process.argv[3]
let key: Buffer = Buffer.alloc(0)
let cert: Buffer = Buffer.alloc(0)
const secure: boolean = !stringIsNullOrEmpty(keyDir) && !stringIsNullOrEmpty(certDir)
if (secure) {
    if (!fs.existsSync(keyDir) || !fs.existsSync(certDir)) {
        throw new Error("Cannot start relay in secure mode without private key or certificate files");
    }

    cert = fs.readFileSync(certDir);
    key = fs.readFileSync(keyDir);
    
    console.log(`secure relay: ${secure}, key: ${keyDir}, cert: ${certDir}`)
}

let server: https.Server
if (secure) 
    server = https.createServer({key: key!, cert: cert!}, app)

app.use(cors())
app.use(express.json())

const provider = new providers.JsonRpcProvider(ethereumURL)
const signer = new Wallet(ethereumPrivateKey, provider)
const contract = new Contract(contractAddress, contractAbi, signer)

app.post("/post-review", async (req, res) => {
    const { review, nullifierHash, groupId, solidityProof } = req.body

    try {
        var b = JSON.parse(review) as IStringBallot
        console.log(`key: ${b.encryptedVote}, [${b.ephPubkey}, ${b.counter}]`)
        publicVoteMappings.set(b.encryptedVote, [b.ephPubkey, b.counter])
        const transaction = await contract.postReview(
            utils.formatBytes32String(b.encryptedVote),
            nullifierHash,
            groupId,
            solidityProof
        )

        await transaction.wait()

        res.status(200).end()
    } catch (error: any) {
        console.error(error)

        res.status(500).end()
    }
})

app.get("/get-vote", async (req, res) => {
    const vote = req.get("vote")

    try {
        console.log(`looing for vote: ${vote}`)
        let partial = publicVoteMappings.get(vote)
        let strBallot: IStringBallot = new stringBallot(partial[0], vote!, partial[1])
        res.setHeader("Access-Control-Expose-Headers", "vote")
        res.setHeader("vote", JSON.stringify(strBallot)).status(200).end()
    } catch (error: any) {
        console.error(error)

        res.status(500).end()
    }
})

app.post("/add-member", async (req, res) => {
    const { groupId, identityCommitment } = req.body

    try {
        const transaction = await contract.addMember(groupId, identityCommitment)

        await transaction.wait()

        res.status(200).end()
    } catch (error: any) {
        console.error(error)

        res.status(500).end()
    }
})

app.post("/set-group-pubkey", async (req, res) => {
    const { groupId, pubkey } = req.body

    try {
        eventKeys.set(groupId, [pubkey])
        console.log("set group pubkey for key:", groupId)

        res.status(200).end()
    } catch (error: any) {
        console.error(error)

        res.status(500).end()
    }
})

app.get("/get-group-pubkey", async (req, res) => {
    const groupId = req.get("groupId")
    try {
        var result = eventKeys.get(groupId!)
        console.log("the pubkey is", result![0])
        res.setHeader("Access-Control-Expose-Headers", "pubkey")
        res.setHeader("pubkey", result!).status(200).end()
    } catch (error: any) {
        console.error(error)

        res.status(500).end()
    }
})

app.post("/set-group-privkey", async (req, res) => {
    var { groupId, privkey } = req.body;

    try {
        console.log(`setting privkey for ${groupId}`)
        let keyTuple = eventKeys.get(groupId)
        console.log(`the group pubkey is ${keyTuple![0]}`)
        keyTuple![1] = privkey
        eventKeys.set(groupId, keyTuple!)
        res.status(200).end()
    } catch (error: any) {
        console.error(error)
        res.status(500).end()
    }
})

app.get("/get-group-privkey", async (req, res) => {
    var groupId = req.get("groupId")

    try {
        console.log(`looking for voting pubkey with id ${groupId}`)
        let keyTuple = eventKeys.get(groupId!)
        res.setHeader("Access-Control-Expose-Headers", "privkey")
        res.setHeader("privkey", keyTuple![1]).status(200).end()
    } catch (error: any) {
        console.error(error)
        res.status(500).end()
    }
})

if (secure && !process.env.RELAY_URL.startsWith('https')) {

    throw new Error("you cannot start the relay in secure mode while the .env relay address is simple http");
}
if (!secure && process.env.RELAY_URL.startsWith('https')) {
    throw new Error("you cannot start the relay in insecure mode while the .env relay address is set to https");
}

if (secure) {
    server!.listen(port, () => {
        console.info(`Started HTTPS relay API at ${process.env.RELAY_URL}/`)
    })
}
else {
    app.listen(port, () => {
        console.info(`Started HTTP relay API at ${process.env.RELAY_URL}/`)
    })
}
