declare module "pg" {
  export class Pool {
    constructor(config?: any);
    query: (...args: any[]) => Promise<any>;
    connect: () => Promise<any>;
  }
}
