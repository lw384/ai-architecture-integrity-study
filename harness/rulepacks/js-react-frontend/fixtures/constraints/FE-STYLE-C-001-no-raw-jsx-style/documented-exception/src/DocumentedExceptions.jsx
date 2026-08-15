export default function DocumentedExceptions({ rowStyle, vendorStyle }) {
    return (
        <>
            {/* eslint-disable-next-line architecture/no-raw-jsx-style -- Virtual rows require runtime geometry from the virtualization API. */}
            <div style={rowStyle} />

            {/* eslint-disable-next-line architecture/no-raw-jsx-style -- VendorWidget exposes only a style prop for this integration. */}
            <VendorWidget style={vendorStyle} />
        </>
    );
}
