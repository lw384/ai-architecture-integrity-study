import { BUSINESS_ERROR_CODES } from '../errors/error-codes';
import { createUuidV4Pipe } from './uuid-v4.pipe';

describe('createUuidV4Pipe', () => {
  it('rejects non-uuid-v4 values with INVALID_UUID', async () => {
    // Verifies invalid route ids return the business UUID error.
    const pipe = createUuidV4Pipe();

    await expect(pipe.transform('not-a-uuid', {} as never)).rejects.toMatchObject(
      {
        status: 400,
        response: {
          code: BUSINESS_ERROR_CODES.INVALID_UUID,
          message: 'The provided id must be a valid UUID v4.',
        },
      },
    );
  });
});
