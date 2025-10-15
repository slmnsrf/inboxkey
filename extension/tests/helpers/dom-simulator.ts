/**
 * DOM Simulator - Create and manipulate DOM environments for testing
 *
 * Provides utilities for creating realistic DOM structures from HTML fixtures,
 * simulating user interactions, and testing OTP input detection.
 */

export interface DOMSimulatorOptions {
  url?: string;
  userAgent?: string;
  runScripts?: 'dangerously' | 'outside-only';
  pretendToBeVisual?: boolean;
}

export interface InputElement {
  element: HTMLInputElement;
  id?: string;
  name?: string;
  type: string;
  attributes: Record<string, string>;
}

/**
 * Create a DOM environment from HTML string
 * Note: This is a placeholder. Use happy-dom's Window class directly in tests.
 */
export function createDOM(html: string, options: DOMSimulatorOptions = {}): Document {
  const {
    url = 'https://example.com',
  } = options;

  // This is a placeholder implementation
  // In actual tests, use happy-dom's Window class directly
  const parser = new DOMParser()
  return parser.parseFromString(html, 'text/html')
}

/**
 * Find all OTP-like input fields in a DOM
 */
export function findOTPInputs(dom: Document): InputElement[] {
  const document = dom;
  const inputs: InputElement[] = [];

  // Query selectors for OTP detection
  const selectors = [
    // By autocomplete attribute
    'input[autocomplete="one-time-code"]',
    'input[autocomplete*="otp"]',

    // By inputmode
    'input[inputmode="numeric"]',

    // By type
    'input[type="tel"]',
    'input[type="number"]',

    // By pattern
    'input[pattern*="[0-9]"]',

    // By ID/name patterns
    'input[id*="otp"]',
    'input[id*="code"]',
    'input[id*="verify"]',
    'input[id*="token"]',
    'input[id*="pin"]',
    'input[id*="mfa"]',
    'input[id*="2fa"]',
    'input[name*="otp"]',
    'input[name*="code"]',
    'input[name*="verify"]',

    // By class patterns
    'input[class*="otp"]',
    'input[class*="code"]',
    'input[class*="verification"]',
  ];

  const foundElements = new Set<HTMLInputElement>();

  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el: Element) => {
        if (el instanceof HTMLInputElement) {
          foundElements.add(el);
        }
      });
    } catch (error) {
      // Invalid selector, skip
    }
  }

  // Convert to InputElement format
  foundElements.forEach((element) => {
    const attributes: Record<string, string> = {};

    // Collect all attributes
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }

    inputs.push({
      element,
      id: element.id || undefined,
      name: element.name || undefined,
      type: element.type,
      attributes,
    });
  });

  return inputs;
}

/**
 * Simulate user input on an element
 */
export function simulateInput(element: HTMLInputElement, value: string): void {
  // Set value
  element.value = value;

  // Trigger events
  const events = ['focus', 'input', 'change', 'blur'];

  events.forEach((eventType) => {
    const event = new element.ownerDocument.defaultView!.Event(eventType, {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
  });
}

/**
 * Simulate keyboard input with individual keystrokes
 */
export function simulateKeyboardInput(element: HTMLInputElement, value: string): void {
  element.focus();

  for (const char of value) {
    const keyCode = char.charCodeAt(0);

    // KeyDown event
    const keyDownEvent = new element.ownerDocument.defaultView!.KeyboardEvent('keydown', {
      key: char,
      code: `Digit${char}`,
      keyCode,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(keyDownEvent);

    // Update value
    element.value += char;

    // Input event
    const inputEvent = new element.ownerDocument.defaultView!.Event('input', {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(inputEvent);

    // KeyUp event
    const keyUpEvent = new element.ownerDocument.defaultView!.KeyboardEvent('keyup', {
      key: char,
      code: `Digit${char}`,
      keyCode,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(keyUpEvent);
  }

  element.blur();
}

/**
 * Simulate paste event
 */
export function simulatePaste(element: HTMLInputElement, value: string): void {
  element.focus();

  const pasteEvent = new element.ownerDocument.defaultView!.ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: new element.ownerDocument.defaultView!.DataTransfer(),
  });

  pasteEvent.clipboardData!.setData('text/plain', value);
  element.dispatchEvent(pasteEvent);

  element.value = value;

  const inputEvent = new element.ownerDocument.defaultView!.Event('input', {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(inputEvent);

  element.blur();
}

/**
 * Inject an input element dynamically (simulates SPA behavior)
 */
export function injectInputDynamically(
  dom: Document,
  parentSelector: string,
  inputHTML: string,
  delay: number = 0
): Promise<HTMLInputElement> {
  const document = dom;

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const parent = document.querySelector(parentSelector);

      if (!parent) {
        reject(new Error(`Parent element not found: ${parentSelector}`));
        return;
      }

      const template = document.createElement('template');
      template.innerHTML = inputHTML.trim();
      const input = template.content.firstElementChild as HTMLInputElement;

      if (!input) {
        reject(new Error('Failed to create input element'));
        return;
      }

      parent.appendChild(input);
      resolve(input);
    }, delay);
  });
}

/**
 * Check if an element is visible in the DOM
 */
export function isElementVisible(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetParent !== null
  );
}

/**
 * Wait for an element to appear in the DOM
 */
export function waitForElement(
  dom: Document,
  selector: string,
  timeout: number = 5000
): Promise<Element> {
  const document = dom;

  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);

    if (element) {
      resolve(element);
      return;
    }

    const observer = new document.defaultView!.MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element not found within timeout: ${selector}`));
    }, timeout);
  });
}

/**
 * Get form context around an input
 */
export function getFormContext(input: HTMLInputElement): {
  form: HTMLFormElement | null;
  labels: HTMLLabelElement[];
  nearbyText: string;
} {
  const form = input.closest('form');
  const labels = Array.from(input.ownerDocument.querySelectorAll(`label[for="${input.id}"]`));

  // Get nearby text (within 100 chars before the input)
  let nearbyText = '';
  let node = input.previousSibling;
  let charCount = 0;

  while (node && charCount < 100) {
    if (node.nodeType === 3) {
      // Text node
      const text = node.textContent || '';
      nearbyText = text + nearbyText;
      charCount += text.length;
    } else if (node.nodeType === 1) {
      // Element node
      const text = (node as Element).textContent || '';
      nearbyText = text + nearbyText;
      charCount += text.length;
    }
    node = node.previousSibling;
  }

  return {
    form,
    labels: labels as HTMLLabelElement[],
    nearbyText: nearbyText.trim(),
  };
}

/**
 * Simulate form submission
 */
export function simulateFormSubmit(form: HTMLFormElement): boolean {
  const submitEvent = new form.ownerDocument.defaultView!.Event('submit', {
    bubbles: true,
    cancelable: true,
  });

  return form.dispatchEvent(submitEvent);
}

/**
 * Create a split-input OTP field (6 separate inputs)
 */
export function createSplitOTPInputs(
  dom: Document,
  parentSelector: string,
  digitCount: number = 6
): HTMLInputElement[] {
  const document = dom;
  const parent = document.querySelector(parentSelector);

  if (!parent) {
    throw new Error(`Parent element not found: ${parentSelector}`);
  }

  const inputs: HTMLInputElement[] = [];

  for (let i = 0; i < digitCount; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 1;
    input.inputMode = 'numeric';
    input.pattern = '[0-9]';
    input.className = 'otp-digit';
    input.id = `otp-digit-${i}`;
    input.setAttribute('data-index', String(i));

    parent.appendChild(input);
    inputs.push(input);
  }

  return inputs;
}

/**
 * Fill split OTP inputs sequentially
 */
export function fillSplitOTPInputs(inputs: HTMLInputElement[], code: string): void {
  const digits = code.split('');

  inputs.forEach((input, index) => {
    if (digits[index]) {
      simulateInput(input, digits[index]);
    }
  });
}

/**
 * Export utility object
 */
export const DOMSimulator = {
  createDOM,
  findOTPInputs,
  simulateInput,
  simulateKeyboardInput,
  simulatePaste,
  injectInputDynamically,
  isElementVisible,
  waitForElement,
  getFormContext,
  simulateFormSubmit,
  createSplitOTPInputs,
  fillSplitOTPInputs,
};

export default DOMSimulator;
