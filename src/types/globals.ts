declare global {
    interface Array<T> {
        set(index: number, value: T): void
        insert(index: number, value: T): T[]
    }
}

export {}