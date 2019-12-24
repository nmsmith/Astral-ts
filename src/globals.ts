declare global {
    interface Array<T> {
        insert(index: number, value: T): T[]
    }
}

// Define array insert
Array.prototype.insert = function<T>(index: number, item: T): T[] {
    return this.splice(index, 0, item)
}

export {}