export function requireElement<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Required UI element is missing: ${selector}`);
  }
  return element;
}
