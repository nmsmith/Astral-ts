import * as FuzzyDict from "./fuzzy-prefix-dict"

interface IDRegistry<Value> {
    lastID: Value
    namesDict: FuzzyDict.T<Value>
}

export type T<Value> = IDRegistry<Value>

export function empty(): IDRegistry<number> {
    return {
        lastID: 0,
        namesDict: FuzzyDict.empty()
    }
}

export function newID(registry: IDRegistry<number>, label?: string): number {
    let id = ++registry.lastID
    if (label !== undefined) {
        FuzzyDict.insert(registry.namesDict, label, id)
    }
    return id
}

export function getID(registry: IDRegistry<number>, label: string): number | undefined {
    let firstResult = undefined
    FuzzyDict.fuzzySearch(registry.namesDict, label).some(result => {
        if (result.distance === 0) {
            firstResult = result.value
            return true
        }
    })
    return firstResult
}

export function getLabel(registry: IDRegistry<number>, id: number): string {
    return "Unimplemented. " + id
}

export function relabelID(registry: IDRegistry<number>, id: number, label: string): void {
    FuzzyDict.insert(registry.namesDict, label, id)
}