/**
 * Configure Salesforce Core logger settings
 * This should be imported at the very beginning of entry files
 * before any other imports that might use @salesforce/core
 * 
 * IMPORTANT: This configuration addresses a critical bundling issue with @salesforce/core:
 * 
 * The Problem:
 * - When bundling @salesforce/core with esbuild, the Pino logger tries to resolve a transform stream
 *   using a fixed relative path: path.join('..', '..', 'lib', 'logger', 'transformStream')
 * - This path resolution fails during runtime because the bundled directory structure differs from
 *   the original node_modules structure, causing the error:
 *   "unable to determine transport target for '..\..\lib\logger\transformStream'"
 * 
 * The Solution:
 * - Disable file logging completely via environment variables
 * - Force the logger to use memory logging instead of file transport
 * - Set minimal log level to reduce unnecessary logging
 * 
 * Benefits:
 * - Allows bundling @salesforce/core directly rather than keeping it as an external dependency
 * - Enables including node_modules in .vscodeignore, dramatically reducing extension size atleast by 75%
 * - Creates a self-contained extension without external runtime dependencies
 */

// Disable file logging to prevent path resolution errors
process.env.SFDX_DISABLE_LOG_FILE = 'true';
process.env.SF_DISABLE_LOG_FILE = 'true';
// Set minimal logging level for Salesforce libraries
process.env.SF_LOG_LEVEL = 'error';
// Force console transport only
process.env.SF_LOG_DIR = '.';
process.env.SF_LOG_FILE = 'false';

export const configureSfCore = () => {
    // This function exists to ensure this file is imported for its side effects
    // No implementation needed as we set env vars at the module level
}; 