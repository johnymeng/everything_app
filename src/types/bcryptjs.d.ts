declare module "bcryptjs" {
  export function hash(data: string, saltOrRounds: string | number): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;

  const bcryptjs: {
    hash: typeof hash;
    compare: typeof compare;
  };

  export default bcryptjs;
}
