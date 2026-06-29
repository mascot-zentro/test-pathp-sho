declare namespace JSX {
  interface IntrinsicElements {
    "behold-widget": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      "feed-id"?: string;
    };
  }
}
