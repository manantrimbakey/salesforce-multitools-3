// Export the public API for the component file switcher feature
export { registerComponentFileSwitcherCommands } from './commands';
export { refreshComponentData } from './commands';
export {
    getComponentFiles,
    getComponentType,
    getComponentName,
    getComponentFolder,
    ComponentType,
    ComponentFileType,
    ComponentFile,
    isLightningComponentFile
} from './componentFileSwitcherUtils'; 