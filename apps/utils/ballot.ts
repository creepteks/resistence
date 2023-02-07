import * as crypto from "../crypto/crypto"

export interface IStringBallot {
    ephPubkey: string
    encryptedVote: string
    counter: string
}

export interface IObjectBallot {
    ephPubkey: CryptoKey
    encryptedVote: ArrayBuffer
    counter: Uint8Array
}

export class stringBallot implements IStringBallot {
    ephPubkey: string
    encryptedVote: string
    counter: string

    constructor(ephemeralKey: string, encryptedVote: string, counter: string) {
        this.ephPubkey = ephemeralKey
        this.encryptedVote = encryptedVote
        this.counter = counter
    }
}

export class ballot implements IObjectBallot {
    ephPubkey: CryptoKey
    encryptedVote: ArrayBuffer
    counter: Uint8Array

    constructor(ephemeralPubkey: CryptoKey, encryptedVote: ArrayBuffer, counter: Uint8Array) {
        this.ephPubkey = ephemeralPubkey
        this.encryptedVote = encryptedVote
        this.counter = counter
    }

    async toString(): Promise<string> {
        let jsonKey = crypto.convertJwkToJson(await crypto.exportJsonWebKey(this.ephPubkey))
        let bs: stringBallot = new stringBallot(
            jsonKey,
            new Uint8Array(this.encryptedVote, 0, this.encryptedVote.byteLength).toString(),
            this.counter.toString()
        )
        return JSON.stringify(bs)
    }

    static async fromJson(json: string): Promise<ballot> {
        let strBallot: stringBallot = JSON.parse(json)
        let jwk = crypto.convertJsonToJwk(strBallot.ephPubkey)
        let importedKey = await crypto.importEcdhJsonWebKey(jwk)
        return new ballot(
            importedKey,
            crypto.strToUInt8Array(strBallot.encryptedVote),
            crypto.strToUInt8Array(strBallot.counter)
        )
    }
}
