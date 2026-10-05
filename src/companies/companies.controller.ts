import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Query,
    ParseIntPipe,
} from '@nestjs/common';

import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

import { RolesGuard } from 'src/common/guards/roles.guard';
import { ResponseFormatter } from 'src/common/utility/responseFormatter';

@Controller( 'api/v1/companies' )
@UseGuards( RolesGuard )
export class CompaniesController {
    constructor ( private readonly companiesService: CompaniesService ) { }
    @Post()
    async create ( @Body() createCompanyDto: CreateCompanyDto ) {
        try
        {
            const newCompany = await this.companiesService.create( createCompanyDto );
            return ResponseFormatter.success(
                newCompany.statusCode || 201,
                newCompany.message || 'Company created successfully',
                newCompany.data,
            );
        } catch ( error )
        {
            return ResponseFormatter.error(
                error.status || 500,
                error.message || 'Internal server error',
            );
        }
    }

    // companies.controller.ts
    @Get()
    async findAllCompanies (
        @Query( 'page', new ParseIntPipe( { optional: true } ) ) page: number = 1,
        @Query( 'limit', new ParseIntPipe( { optional: true } ) ) limit: number = 10,
        @Query( 'name' ) name: string = '',
        @Query( 'email' ) email: string = '',
        @Query( 'contactNumber' ) contactNumber: string = '',
        @Query( 'isActive' ) isActive?: string,
        @Query( 'startDate' ) startDate: string = '',
        @Query( 'endDate' ) endDate: string = '',
    ) {
        // Debug log to see what's coming in
        console.log( "Query params received:", {
            page,
            limit,
            name,
            email,
            contactNumber,
            isActive,
            startDate,
            endDate
        } );

        // Safely convert isActive string to boolean/undefined
        let active: number | undefined;
        if ( isActive !== undefined && isActive !== '' )
        {
            if ( isActive.toLowerCase() === 'true' )
            {
                active = 1;
            } else if ( isActive.toLowerCase() === 'false' )
            {
                active = 0;
            } else
            {
                active = undefined;
            }
        }

        console.log( "Converted isActive:", active );

        return ResponseFormatter.success(
            200,
            'Companies Retrieved Successfully',
            await this.companiesService.findAllCompanies(
                page,
                limit,
                name,
                email,
                contactNumber,
                active,
                startDate,
                endDate,
            ),
        );
    }


    @Get( ':id' )
    async findOne ( @Param( 'id' ) id: string ) {
        try
        {
            const company = await this.companiesService.findOne( +id );
            return ResponseFormatter.success(
                200,
                'Company retrieved successfully',
                company,
            );
        } catch ( error )
        {
            return ResponseFormatter.error(
                error.status || 404,
                error.message || 'Company not found',
            );
        }
    }

    @Get( ':id/details' )
    async findCompanyWithDetail ( @Param( 'id' ) id: number ) {
        const company = await this.companiesService.findCompanyWithDetail( +id );
        return ResponseFormatter.success( 200, 'Company with Details retrieved successfully', company );
    }

    @Patch( ':id' )
    async update (
        @Param( 'id' ) id: number,
        @Body() updateCompanyDto: UpdateCompanyDto,
    ) {
        try
        {
            const updatedCompany = await this.companiesService.update(
                +id,
                updateCompanyDto,
            );
            return ResponseFormatter.success( 200, 'Company updated successfully', updatedCompany );
        } catch ( error )
        {
            return ResponseFormatter.error(
                error.status || 500,
                error.message || 'Internal server error',
            );
        }
    }

    @Delete( ':id' )
    async remove (
        @Param( 'id' ) id: number,
        @Body() body: { reason: string; deletedBy: number },
    ) {
        try
        {
            if ( !id || isNaN( id ) )
            {
                throw new Error( 'Invalid company ID' );
            }

            if ( !body.reason || body.reason.trim() === '' )
            {
                throw new Error( 'Reason for deletion is required' );
            }

            const deletingReason = body.reason.trim();
            const deletedBy = body.deletedBy;

            await this.companiesService.remove( id, deletingReason, deletedBy );

            return ResponseFormatter.success( 200, 'Company deleted successfully' );
        } catch ( error )
        {
            console.error( 'Error deleting company:', error );
            return ResponseFormatter.error(
                error.status || 500,
                error.message || 'Internal server error',
            );
        }
    }

    @Patch( ':id/deactivate' )
    async deactivateCompany ( @Param( 'id' ) id: number ) {
        try
        {
            const company = await this.companiesService.deactivateCompany( +id );
            return ResponseFormatter.success(
                200,
                'Company deactivated successfully',
                company,
            );
        } catch ( error )
        {
            return ResponseFormatter.error(
                error.status || 500,
                error.message || 'Internal server error',
            );
        }
    }

    @Patch( 'by-company-id/:companyId/deactivate' )
    async deactivateByCompanyId ( @Param( 'companyId' ) companyId: number ) {
        try {
            const company = await this.companiesService.deactivateByCompanyId( +companyId );
            return ResponseFormatter.success( 200, 'Company deactivated successfully', company );
        } catch ( error ) {
            return ResponseFormatter.error( error.status || 500, error.message || 'Internal server error' );
        }
    }

    @Patch( ':id/activate' )
    async activateCompany ( @Param( 'id' ) id: number ) {
        try
        {
            const company = await this.companiesService.activateCompany( +id );
            return ResponseFormatter.success(
                200,
                'Company activated successfully',
                company,
            );
        } catch ( error )
        {
            return ResponseFormatter.error(
                error.status || 500,
                error.message || 'Internal server error',
            );
        }
    }
}