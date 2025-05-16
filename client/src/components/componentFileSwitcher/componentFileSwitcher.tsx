import { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    Typography,
    // Chip,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Divider,
    Paper,
    // Box,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import CssIcon from '@mui/icons-material/Css';
import JavascriptIcon from '@mui/icons-material/Javascript';
import SettingsIcon from '@mui/icons-material/Settings';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import HtmlIcon from '@mui/icons-material/Html';
import { useVSCodeApi } from '../../App';

// Interface for the component file data
interface ComponentFile {
    path: string;
    name: string;
    type: string;
    priority: number;
    isBaseFile: boolean;
    isUnsaved: boolean;
}

// Component types
type ComponentType = 'LWC' | 'AURA' | 'UNKNOWN';

// Component data from the extension
interface ComponentData {
    componentName: string | null;
    componentType: ComponentType;
    fileName: string;
    files: ComponentFile[];
}

export default function ComponentFileSwitcher() {
    // Get VS Code API from context
    const vscode = useVSCodeApi();

    const [componentData, setComponentData] = useState<ComponentData>({
        componentName: null,
        componentType: 'UNKNOWN',
        fileName: '',
        files: [],
    });

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            // Handle component file switcher refresh
            if (message.command === 'componentFileSwitcherRefresh') {
                console.log('Component data refresh:', message.data);
                setComponentData(message.data);
            }
        };

        // Add message event listener
        window.addEventListener('message', handleMessage);

        // Cleanup
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Handle click on a component file
    const handleFileClick = (filePath: string) => {
        // Send message to extension to open the file
        vscode.postMessage({
            command: 'openFile',
            filePath,
        });
    };

    // Get icon based on file type
    const getFileIcon = (type: string) => {
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
    };

    // Group files by type for better organization
    const filesByType = componentData.files.reduce(
        (acc, file) => {
            const type = file.type;
            if (!acc[type]) {
                acc[type] = [];
            }
            acc[type].push(file);
            return acc;
        },
        {} as Record<string, ComponentFile[]>,
    );

    // If no component detected, show empty state
    if (componentData.componentType === 'UNKNOWN' || !componentData.componentName) {
        return (
            <Card sx={{ borderRadius: '0.25rem' }}>
                <CardContent>
                    <Typography variant="h6">Component File Switcher</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Open an LWC or Aura component file to see related files here. Use Alt+O (Option+O on Mac) to
                        quickly switch between files.
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    // Display the component info and files
    return (
        <Card sx={{ borderRadius: '0.25rem' }}>
            <CardContent>
                {/* <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Component Files</Typography>
                    <Chip 
                        label={componentData.componentType} 
                        size="small" 
                        color={componentData.componentType === 'LWC' ? 'primary' : 'secondary'} 
                    />
                </Box> */}

                {/* <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {componentData.componentName}
                </Typography> */}

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Current: {componentData.fileName}
                </Typography>

                <Paper variant="outlined">
                    <List dense disablePadding>
                        {Object.entries(filesByType).map(([type, files]) => (
                            <div key={type}>
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

                                {files.map((file) => {
                                    const isCurrentFile = file.name === componentData.fileName;
                                    return (
                                        <ListItem
                                            key={file.path}
                                            onClick={() => handleFileClick(file.path)}
                                            sx={{
                                                pl: 2,
                                                cursor: 'pointer',
                                                bgcolor: isCurrentFile ? 'primary.main' : 'transparent',
                                                color: isCurrentFile ? 'primary.contrastText' : 'inherit',
                                                '&:hover': {
                                                    bgcolor: isCurrentFile ? 'primary.dark' : 'action.hover',
                                                },
                                            }}
                                        >
                                            <ListItemIcon
                                                sx={{
                                                    minWidth: 36,
                                                    color: isCurrentFile ? 'primary.contrastText' : 'inherit',
                                                }}
                                            >
                                                {getFileIcon(file.type)}
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={
                                                    <Typography
                                                        variant="body2"
                                                        sx={{
                                                            fontWeight: file.isBaseFile ? 'bold' : 'normal',
                                                            color: 'inherit',
                                                        }}
                                                    >
                                                        {file.name}
                                                    </Typography>
                                                }
                                            />
                                            {file.isUnsaved && (
                                                <FiberManualRecordIcon
                                                    fontSize="small"
                                                    color="warning"
                                                    sx={{ width: 10, height: 10 }}
                                                />
                                            )}
                                        </ListItem>
                                    );
                                })}
                            </div>
                        ))}
                    </List>
                </Paper>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                    Press Alt+O (Option+O on Mac) to switch files
                </Typography>
            </CardContent>
        </Card>
    );
}
