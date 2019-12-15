declare global {
    interface Array<T> {
        insert(index: number, item: T): T[];
    }
}

export {}