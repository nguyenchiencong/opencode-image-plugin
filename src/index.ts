import plugin from "./plugin.js";

export { default as plugin } from "./plugin.js";

export default function unified(input?: any): any {
  if (input && typeof input === "object" && "client" in input) {
    return plugin(input);
  }
  return null;
}
