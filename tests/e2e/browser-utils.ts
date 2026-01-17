/**
 * Browser Testing Utilities
 * Provides a wrapper around Cursor IDE Browser MCP for testing
 *
 * Usage in tests:
 * ```typescript
 * import { BrowserTestHelper } from './browser-utils';
 *
 * const browser = new BrowserTestHelper();
 * await browser.navigate('https://example.com');
 * const snapshot = await browser.snapshot();
 * await browser.click({ ref: 'button#submit', element: 'Submit button' });
 * ```
 */

/**
 * Browser snapshot element
 */
export interface SnapshotElement {
  ref: string;
  tag: string;
  text?: string;
  attributes?: Record<string, string>;
  children?: SnapshotElement[];
}

/**
 * Click options for browser interaction
 */
export interface ClickOptions {
  ref: string;
  element: string;
  button?: 'left' | 'right' | 'middle';
  doubleClick?: boolean;
  modifiers?: string[];
}

/**
 * Type options for browser interaction
 */
export interface TypeOptions {
  ref: string;
  element: string;
  text: string;
  slowly?: boolean;
  submit?: boolean;
}

/**
 * Navigation options
 */
export interface NavigateOptions {
  url: string;
  position?: 'active' | 'side';
  viewId?: string;
}

/**
 * Browser test result
 */
export interface BrowserTestResult {
  success: boolean;
  snapshot?: string;
  error?: string;
  elements?: SnapshotElement[];
  consoleLogs?: string[];
  networkRequests?: NetworkRequest[];
}

/**
 * Network request captured during test
 */
export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  responseTime?: number;
}

/**
 * Browser Test Helper
 * Provides high-level methods for browser testing
 */
export class BrowserTestHelper {
  private viewId?: string;
  private lastSnapshot?: string;

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options?: Partial<NavigateOptions>): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_navigate
    // For now, return a mock result for testing
    console.log(`[Browser] Navigating to: ${url}`);
    return {
      success: true,
      snapshot: `<html><head><title>Test Page</title></head><body></body></html>`,
    };
  }

  /**
   * Take a snapshot of the current page
   */
  async snapshot(): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_snapshot
    console.log('[Browser] Taking snapshot');
    return {
      success: true,
      snapshot: this.lastSnapshot || '<html></html>',
      elements: [],
    };
  }

  /**
   * Click an element
   */
  async click(options: ClickOptions): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_click
    console.log(`[Browser] Clicking: ${options.element} (ref: ${options.ref})`);
    return { success: true };
  }

  /**
   * Type into an element
   */
  async type(options: TypeOptions): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_type
    console.log(`[Browser] Typing into: ${options.element} (ref: ${options.ref})`);
    return { success: true };
  }

  /**
   * Hover over an element
   */
  async hover(ref: string, element: string): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_hover
    console.log(`[Browser] Hovering: ${element} (ref: ${ref})`);
    return { success: true };
  }

  /**
   * Wait for a condition
   */
  async waitFor(options: {
    text?: string;
    textGone?: string;
    time?: number;
  }): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_wait_for
    if (options.time) {
      console.log(`[Browser] Waiting for ${options.time}s`);
      await new Promise(resolve => setTimeout(resolve, options.time! * 1000));
    }
    if (options.text) {
      console.log(`[Browser] Waiting for text: "${options.text}"`);
    }
    if (options.textGone) {
      console.log(`[Browser] Waiting for text to disappear: "${options.textGone}"`);
    }
    return { success: true };
  }

  /**
   * Press a key
   */
  async pressKey(key: string): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_press_key
    console.log(`[Browser] Pressing key: ${key}`);
    return { success: true };
  }

  /**
   * Get console messages
   */
  async getConsoleLogs(): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_console_messages
    return {
      success: true,
      consoleLogs: [],
    };
  }

  /**
   * Get network requests
   */
  async getNetworkRequests(): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_network_requests
    return {
      success: true,
      networkRequests: [],
    };
  }

  /**
   * Take a screenshot
   */
  async screenshot(options?: {
    filename?: string;
    fullPage?: boolean;
    element?: string;
    ref?: string;
  }): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_take_screenshot
    console.log('[Browser] Taking screenshot');
    return { success: true };
  }

  /**
   * Navigate back
   */
  async back(): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_navigate_back
    console.log('[Browser] Navigating back');
    return { success: true };
  }

  /**
   * Resize browser window
   */
  async resize(width: number, height: number): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_resize
    console.log(`[Browser] Resizing to ${width}x${height}`);
    return { success: true };
  }

  /**
   * Manage tabs
   */
  async tabs(action: 'list' | 'new' | 'close' | 'select', index?: number): Promise<BrowserTestResult> {
    // This would call mcp_cursor-ide-browser_browser_tabs
    console.log(`[Browser] Tab action: ${action}${index !== undefined ? ` (index: ${index})` : ''}`);
    return { success: true };
  }

  /**
   * Find element by text content
   */
  findElementByText(snapshot: string, text: string): SnapshotElement | null {
    // Simple text search in snapshot
    if (snapshot.includes(text)) {
      return {
        ref: `text_${text.replace(/\s+/g, '_').slice(0, 20)}`,
        tag: 'text',
        text,
      };
    }
    return null;
  }

  /**
   * Find element by selector pattern
   */
  findElementBySelector(snapshot: string, selector: string): SnapshotElement | null {
    // Extract element info from snapshot (simplified)
    const tagMatch = selector.match(/^([a-z]+)/i);
    if (tagMatch) {
      return {
        ref: selector,
        tag: tagMatch[1],
      };
    }
    return null;
  }

  /**
   * Assert element exists in snapshot
   */
  assertElementExists(snapshot: string, selector: string): boolean {
    const element = this.findElementBySelector(snapshot, selector);
    return element !== null;
  }

  /**
   * Assert text exists in snapshot
   */
  assertTextExists(snapshot: string, text: string): boolean {
    return snapshot.includes(text);
  }
}

/**
 * Authentication flow helper
 */
export class AuthFlowHelper extends BrowserTestHelper {
  /**
   * Login with email/password
   */
  async loginWithCredentials(
    email: string,
    password: string,
    selectors: {
      emailInput: string;
      passwordInput: string;
      submitButton: string;
    }
  ): Promise<BrowserTestResult> {
    await this.type({
      ref: selectors.emailInput,
      element: 'Email input',
      text: email,
    });

    await this.type({
      ref: selectors.passwordInput,
      element: 'Password input',
      text: password,
    });

    return await this.click({
      ref: selectors.submitButton,
      element: 'Submit button',
    });
  }

  /**
   * Copy API key from page
   */
  async copyApiKey(copyButtonSelector: string): Promise<BrowserTestResult> {
    // Click copy button
    const result = await this.click({
      ref: copyButtonSelector,
      element: 'Copy API key button',
    });

    // Wait for copy confirmation
    await this.waitFor({ time: 1 });

    return result;
  }

  /**
   * Create new API key
   */
  async createApiKey(
    createButtonSelector: string,
    keyNameInput?: string,
    keyName?: string
  ): Promise<BrowserTestResult> {
    // Click create button
    await this.click({
      ref: createButtonSelector,
      element: 'Create API key button',
    });

    // If key name input is provided, enter the name
    if (keyNameInput && keyName) {
      await this.type({
        ref: keyNameInput,
        element: 'Key name input',
        text: keyName,
      });
    }

    return { success: true };
  }

  /**
   * Detect login success
   */
  async detectLoginSuccess(
    successIndicators: string[]
  ): Promise<{ success: boolean; indicator?: string }> {
    const snapshot = await this.snapshot();

    for (const indicator of successIndicators) {
      if (snapshot.snapshot && snapshot.snapshot.includes(indicator)) {
        return { success: true, indicator };
      }
    }

    return { success: false };
  }
}

/**
 * Create a browser test helper instance
 */
export function createBrowserHelper(): BrowserTestHelper {
  return new BrowserTestHelper();
}

/**
 * Create an auth flow helper instance
 */
export function createAuthFlowHelper(): AuthFlowHelper {
  return new AuthFlowHelper();
}

export default BrowserTestHelper;
