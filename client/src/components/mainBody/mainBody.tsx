import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useHostMessage } from '../../hooks/useHostMessage';
import { vscode } from '../../vscodeApi';

// Component registry - add new components here. Each is code-split into its own chunk.
const COMPONENTS = {
    componentFileSwitcher: lazy(() => import('../componentFileSwitcher/componentFileSwitcher')),
    debugLogFetcher: lazy(() => import('../debugLogFetcher/debugLogFetcher')),
};

type ComponentName = keyof typeof COMPONENTS;

// Default component when none (or an unknown one) is specified
const DEFAULT_COMPONENT: ComponentName = 'componentFileSwitcher';

function isComponentName(name: string): name is ComponentName {
    return Object.prototype.hasOwnProperty.call(COMPONENTS, name);
}

function MainBody() {
    const [activeComponent, setActiveComponent] = useState<ComponentName>(DEFAULT_COMPONENT);

    useHostMessage(
        'setActiveComponent',
        (message) => setActiveComponent(isComponentName(message.component) ? message.component : DEFAULT_COMPONENT),
        true,
    );

    // Tell the host we are ready (it replies with the active component). Once per webview, not per switch.
    useEffect(() => {
        vscode.postMessage({ command: 'ready' });
    }, []);

    const ComponentToRender = COMPONENTS[activeComponent];

    return (
        <Box sx={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', padding: '8px' }}>
                <Suspense
                    fallback={
                        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                            <CircularProgress size={24} aria-label="Loading" />
                        </Box>
                    }
                >
                    <ComponentToRender />
                </Suspense>
            </Box>
        </Box>
    );
}

export default MainBody;
