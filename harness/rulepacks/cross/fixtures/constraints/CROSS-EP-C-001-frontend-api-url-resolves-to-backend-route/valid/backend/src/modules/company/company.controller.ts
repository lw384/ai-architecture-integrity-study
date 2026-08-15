import { Controller, Get, HttpCode, Post } from '@nestjs/common';

@Controller('companies')
export class CompanyController {
    @Get()
    list() {}

    @Get(':id')
    getOne() {}

    @Post()
    @HttpCode(201)
    create() {}
}
