/**
 * Lovable login flow — input fillers.
 *
 * Sets `value` and dispatches the React-friendly `input` + `change`
 * events so controlled components register the change. Throws when the
 * target node is missing so the caller (`run-login`) can record a typed
 * step failure with the missing XPath.
 */

import { queryButtonByXPath, queryInputByXPath } from "./dom-xpath";

const dispatchInputChange = (input: HTMLInputElement): void => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
};

export const fillInput = (xpath: string, value: string): void => {
    const input = queryInputByXPath(xpath);

    if (input === null) {
        throw new Error(`Login input not found at XPath: ${xpath}`);
    }

    input.focus();
    input.value = value;
    dispatchInputChange(input);
};

export const clickButton = (xpath: string): void => {
    const button = queryButtonByXPath(xpath);

    if (button === null) {
        throw new Error(`Login button not found at XPath: ${xpath}`);
    }

    button.click();
};
