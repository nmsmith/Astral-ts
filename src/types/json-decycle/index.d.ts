// Define the added JSON functionality from decycle.js
declare module "json-decycle" {
    export namespace JSON {
        /* eslint-disable */
        export function stringify(obj: any): string;
        export function parse(str: string): any;
        export function decycle(obj: any): any;
        export function retrocycle(obj: any): any;
    }

    export default JSON
}