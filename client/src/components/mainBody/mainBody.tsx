import { Grid, Typography, Button } from '@mui/material';
import { useState, useEffect } from 'react';
import { useVSCodeApi } from '../../App';

function MainBody() {
    const vscode = useVSCodeApi();
    const [message, setMessage] = useState('');

    useEffect(() => {
        // Handle messages from VS Code
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            
            if (message.command === 'responseData') {
                setMessage(message.data.message);
            }
        };

        // Add event listener
        window.addEventListener('message', handleMessage);

        // Let VS Code know we're ready
        vscode.postMessage({ command: 'ready' });

        // Clean up
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [vscode]);

    const handleRequestData = () => {
        vscode.postMessage({ command: 'requestData' });
    };

    return (
        <Grid container direction="column" alignItems={'normal'} spacing={2}>
            <Grid>
                <Typography variant="body1">Main Body 1</Typography>
            </Grid>
            <Grid>
                <Typography variant="body1">Main Body 2</Typography>
            </Grid>
            <Grid>
                <Button variant="contained" onClick={handleRequestData}>
                    Get Data from VS Code
                </Button>
            </Grid>
            {message && (
                <Grid>
                    <Typography variant="body1">Response: {message}</Typography>
                </Grid>
            )}
        </Grid>
    );
}

export default MainBody;
