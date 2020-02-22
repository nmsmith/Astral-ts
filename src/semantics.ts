export type Obj = {type: "constant", name: string} | {type: "variable", name: string}

export interface Fact {
    readonly sign: "positive" | "negative"
    readonly relation: string
    readonly objects: Obj[]
}

export interface Rule {
    readonly head: Fact
    readonly body: Fact[]
}