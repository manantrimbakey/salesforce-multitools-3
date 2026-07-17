import { Box } from '@mui/material';
import { useEffect, useState } from 'react';
import ComponentFileSwitcher from '../componentFileSwitcher/componentFileSwitcher';
import DebugLogFetcher from '../debugLogFetcher/debugLogFetcher';
import { useHostEvent } from '../../vscode/useHostEvent';
import { messenger } from '../../vscode/messenger';

const COMPONENTS = {
    componentFileSwitcher: ComponentFileSwitcher,
    debugLogFetcher: DebugLogFetcher,
};

const DEFAULT_COMPONENT = 'componentFileSwitcher';

function MainBody() {
    const [activeComponent, setActiveComponent] = useState<string>(DEFAULT_COMPONENT);

    useHostEvent('setActiveComponent', (_data, component) => {
        if (component) {
            setActiveComponent(component);
        }
    });

    useEffect(() => {
        messenger.postMessage({
            command: 'ready',
            data: { currentComponent: activeComponent },
        });
    }, [activeComponent]);

    const renderComponent = () => {
        const ComponentToRender = COMPONENTS[activeComponent as keyof typeof COMPONENTS];

        if (!ComponentToRender) {
            const DefaultComponent = COMPONENTS[DEFAULT_COMPONENT as keyof typeof COMPONENTS];
            return <DefaultComponent />;
        }

        return <ComponentToRender />;
    };

    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Box
                sx={{
                    flexGrow: 1,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    padding: '8px',
                }}
            >
                {renderComponent()}
            </Box>
        </Box>
    );
}

export default MainBody;
