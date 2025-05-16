/// <reference types="react" />
/// <reference types="react-dom" />

declare module "*.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.svg" {
  import * as React from "react";

  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;

  const src: string;
  export default src;
}

// VS Code WebView API
interface WebviewApi<T> {
  postMessage(message: any): void;
  getState(): T;
  setState(state: T): void;
}

declare global {
  interface Window {
    acquireVsCodeApi<T>(): WebviewApi<T>;
  }
} 