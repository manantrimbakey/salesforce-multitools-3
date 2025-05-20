import { Grid } from '@mui/material';
import { useEffect, useState } from 'react';
import { useVSCodeApi } from '../../App';
import ComponentFileSwitcher from '../componentFileSwitcher/componentFileSwitcher';
import DebugLogFetcher from '../debugLogFetcher/debugLogFetcher';

// Component registry - add new components here
const COMPONENTS = {
    componentFileSwitcher: ComponentFileSwitcher,
    debugLogFetcher: DebugLogFetcher,
    // Add more components as needed
};

// Default component when none is specified
const DEFAULT_COMPONENT = 'componentFileSwitcher';

function MainBody() {
    const vscode = useVSCodeApi();
    const [activeComponent, setActiveComponent] = useState<string>(DEFAULT_COMPONENT);

    useEffect(() => {
        // Handle messages from VS Code
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            // Set the active component based on VS Code message
            if (message.command === 'setActiveComponent' && message.component) {
                setActiveComponent(message.component);
            }
        };

        // Add event listener
        window.addEventListener('message', handleMessage);

        // Let VS Code know we're ready and request the active component
        vscode.postMessage({
            command: 'ready',
            data: { currentComponent: activeComponent },
        });

        // Clean up
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [vscode, activeComponent]);

    // Dynamically render the component based on the active component name
    const renderComponent = () => {
        const ComponentToRender = COMPONENTS[activeComponent as keyof typeof COMPONENTS];

        // If the component doesn't exist in our registry, use the default
        if (!ComponentToRender) {
            const DefaultComponent = COMPONENTS[DEFAULT_COMPONENT];
            return <DefaultComponent />;
        }

        return <ComponentToRender />;
    };

    return (
        <Grid container direction="column" alignItems={'normal'} spacing={2}>
            <Grid>{renderComponent()}</Grid>
        </Grid>
    );
}

export default MainBody;
