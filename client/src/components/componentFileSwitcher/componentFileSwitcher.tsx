import { Fragment, useMemo, useState } from 'react';
import {
    Card,
    CardContent,
    Typography,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Divider,
    Paper,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import CssIcon from '@mui/icons-material/Css';
import JavascriptIcon from '@mui/icons-material/Javascript';
import SettingsIcon from '@mui/icons-material/Settings';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import HtmlIcon from '@mui/icons-material/Html';
import { useHostMessage } from '../../hooks/useHostMessage';
import type { ComponentData, ComponentFile } from '../../messages';
import { vscode } from '../../vscodeApi';

const EMPTY_DATA: ComponentData = { componentName: null, componentType: 'UNKNOWN', fileName: '', files: [] };

function getFileIcon(type: string) {
    switch (type) {
        case 'JavaScript':
        case 'Controller':
        case 'Helper':
        case 'Renderer':
            return <JavascriptIcon fontSize="small" />;
        case 'CSS':
            return <CssIcon fontSize="small" />;
        case 'HTML/Markup':
            return <HtmlIcon fontSize="small" />;
        case 'XML Metadata':
            return <SettingsIcon fontSize="small" />;
        default:
            return <DescriptionIcon fontSize="small" />;
    }
}

function handleFileClick(filePath: string) {
    vscode.postMessage({ command: 'openFile', filePath });
}

export default function ComponentFileSwitcher() {
    const [componentData, setComponentData] = useState<ComponentData>(EMPTY_DATA);

    // Replay: the host may send the first refresh before this lazy-loaded component mounts.
    useHostMessage('componentFileSwitcherRefresh', (message) => setComponentData(message.data), true);

    // Group files by type for better organization
    const filesByType = useMemo(() => {
        const groups = new Map<string, ComponentFile[]>();
        for (const file of componentData.files) {
            const group = groups.get(file.type);
            if (group) group.push(file);
            else groups.set(file.type, [file]);
        }
        return [...groups];
    }, [componentData.files]);

    // If no component detected, show empty state
    if (componentData.componentType === 'UNKNOWN' || !componentData.componentName) {
        return (
            <Card
                sx={{
                    borderRadius: '0.25rem',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <CardContent
                    sx={{
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <Typography variant="h6">Component File Switcher</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                        Open an LWC or Aura component file to see related files here. Use Alt+O (Option+O on Mac) to
                        quickly switch between files.
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    // Display the component info and files
    return (
        <Card
            sx={{
                borderRadius: '0.25rem',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <Paper
                variant="outlined"
                sx={{
                    flexGrow: 1,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <List
                    dense
                    disablePadding
                    sx={{
                        overflowY: 'auto',
                        flexGrow: 1,
                    }}
                >
                    {filesByType.map(([type, files]) => (
                        <Fragment key={type}>
                            <ListItem sx={{ bgcolor: 'action.hover' }}>
                                <ListItemText
                                    primary={
                                        <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                            {type}
                                        </Typography>
                                    }
                                />
                            </ListItem>
                            <Divider />

                            {files.map((file) => (
                                <ListItem key={file.path} disablePadding>
                                    <ListItemButton
                                        selected={file.name === componentData.fileName}
                                        onClick={() => handleFileClick(file.path)}
                                    >
                                        <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                                            {getFileIcon(file.type)}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={file.name}
                                            slotProps={{
                                                primary: {
                                                    variant: 'body2',
                                                    fontWeight: file.isBaseFile ? 'bold' : 'normal',
                                                },
                                            }}
                                        />
                                        {file.isUnsaved && (
                                            <FiberManualRecordIcon
                                                fontSize="small"
                                                color="warning"
                                                titleAccess="Unsaved changes"
                                                sx={{ width: 10, height: 10 }}
                                            />
                                        )}
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </Fragment>
                    ))}
                </List>
            </Paper>

            <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                    display: 'block',
                    flexShrink: 0,
                    textAlign: 'center',
                }}
            >
                Press Alt+O (Option+O on Mac) to switch files
            </Typography>
        </Card>
    );
}
