// material-ui
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputAdornment from '@mui/material/InputAdornment';
import OutlinedInput from '@mui/material/OutlinedInput';

// assets
import SearchOutlined from '@ant-design/icons/SearchOutlined';

// ==============================|| HEADER CONTENT - SEARCH ||============================== //

export default function Search() {
  return (
    <Box sx={{ ml: { xs: 0, md: 1 }, width: '100%' }}>
      <FormControl sx={{ width: '100%', maxWidth: { md: '14rem' } }}>
        <OutlinedInput
          size="small"
          id="header-search"
          startAdornment={
            <InputAdornment position="start" sx={{ mr: -0.5 }}>
              <SearchOutlined />
            </InputAdornment>
          }
          aria-describedby="header-search-text"
          slotProps={{ input: { 'aria-label': 'weight' } }}
          placeholder="Ctrl + K"
        />
      </FormControl>
    </Box>
  );
}