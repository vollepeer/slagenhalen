import oklabFunction from "@csstools/postcss-oklab-function";

export default {
  plugins: [
    oklabFunction({ preserve: true, subFeatures: { displayP3: false } })
  ]
};
