import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import styles from './ManagedStyles.module.scss';

const StyledSection = styled('section')(({ theme }) => ({
    padding: theme.spacing(2),
    color: theme.vars.palette.text.primary,
}));

export default function ManagedStyles({ progress }) {
    return (
        <>
            <Box sx={{ p: 2, color: 'text.secondary' }} />
            <StyledSection />
            <div className={styles.panel} />
            <div
                className={styles.progress}
                style={{ '--progress': `${progress}%` }}
            />
        </>
    );
}
