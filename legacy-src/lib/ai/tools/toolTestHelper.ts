/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Helper function to execute AI SDK v5 tools in tests
 * In v5, execute returns Result | AsyncIterable<Result> | PromiseLike<...>
 * For our tools, it always returns Result directly, not AsyncIterable
 */
export async function executeToolForTest<T>(
    execute:
        | ((input: any, options: any) => Promise<T | AsyncIterable<T>> | T | AsyncIterable<T> | PromiseLike<any>)
        | undefined,
    input: any,
    options: any = { messages: [], toolCallId: '' }
): Promise<T> {
    if (!execute) {
        throw new Error('Tool execute function is undefined');
    }

    const result = await execute(input, options);

    // If result is AsyncIterable, throw error (our tools don't use this)
    if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
        throw new Error('Tool returned AsyncIterable, but test expected direct result');
    }

    return result;
}
