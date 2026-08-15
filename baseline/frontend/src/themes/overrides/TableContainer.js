/** Preserve the existing table shell shape through the MUI theme. */
export default function TableContainer() {
  return {
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 0
        }
      }
    }
  };
}
