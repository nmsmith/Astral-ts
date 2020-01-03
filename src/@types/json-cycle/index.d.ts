// Define the added JSON functionality from decycle.js
declare module "json-cycle" {
    export namespace JSON {
        /* eslint-disable */
        export function decycle(obj: any): any;
        export function retrocycle(obj: any): any;
    }

    export default JSON
}