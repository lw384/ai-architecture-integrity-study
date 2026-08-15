const iconStyle = { fontSize: 18 };

export default function UnmanagedStyles({ progress }) {
    return (
        <>
            <div style={{ color: 'red' }} />
            <Box style={{ padding: 16 }} />
            <Icon style={iconStyle} />
            <div style={{ '--progress': `${progress}%`, color: 'red' }} />
        </>
    );
}
