// lint-staged config
// Using function syntax so tsc receives no file args (it checks the whole project).
export default {
  "src-react/**/*.{ts,tsx}": () => "npx tsc --noEmit",
};
