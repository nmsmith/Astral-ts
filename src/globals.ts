declare global {
    interface Array<T> {
        insert(index: number, value: T): void
        removeAt(index: number): T
    }
}

Array.prototype.insert = function<T>(index: number, item: T): void {
    this.splice(index, 0, item)
}

Array.prototype.removeAt = function<T>(index: number): T {
    return this.splice(index, 1)[0]
}

export {}