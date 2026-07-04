export type Ok<T extends object = object> = T & { ok: true };
export type Fail = { ok: false; error: string };
export type Result<T extends object = object> = Ok<T> | Fail;
