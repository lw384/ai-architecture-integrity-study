import { Controller, Get } from '@nestjs/common';

@Controller('ghosts')
export class GhostController {
    @Get()
    list() {}
}
