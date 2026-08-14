import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyListQueryDto, CreateCompanyDto, UpdateCompanyDto } from './dto';
import { createUuidV4Pipe } from '../../common/pipes/uuid-v4.pipe';

@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}
  /**
   * create a new company
   * POST /api/companies
   */
  @Post()
  async create(@Body() createCompanyDto: CreateCompanyDto) {
    const newCompany =
      await this.companyService.createCompany(createCompanyDto);

    return {
      success: true,
      message: 'Company created successfully',
      companyId: newCompany.id,
    };
  }

  /**
   * GET /api/companies?page=1&pageSize=10&q=acme&status=1&industry=TECHNOLOGY
   */
  @Get()
  findAll(@Query() query: CompanyListQueryDto) {
    return this.companyService.getCompanies(query);
  }

  /**
   * Get company details by ID
   * GET /api/companies/:id
   */
  @Get(':id')
  findOne(@Param('id', createUuidV4Pipe()) id: string) {
    return this.companyService.getCompanyById(id);
  }

  /**
   * Update a company partially
   * POST /api/companies/:id
   */
  @Post(':id')
  update(
    @Param('id', createUuidV4Pipe()) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companyService.updateCompany(id, updateCompanyDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', createUuidV4Pipe()) id: string): Promise<void> {
    return this.companyService.removeCompany(id);
  }
}
