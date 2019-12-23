declare global {
    interface Array<T> {
        insert(index: number, value: T): T[]
    }
}

export {}