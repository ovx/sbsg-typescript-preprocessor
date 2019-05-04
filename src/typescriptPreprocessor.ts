import {File, TypescriptParser, InterfaceDeclaration, ClassDeclaration, Declaration} from 'typescript-parser'
import {processTsDeclarationInterface, CustomProperties, EmptyProperties, processTsObject} from './joiGenerator'
import * as Joi from 'joi'
import * as FastGlob from 'fast-glob'

export {CustomProperties, EmptyProperties} from './joiGenerator'

const parser = new TypescriptParser()
const workspaceRoot = 'dummy' // the value probably doesn't matter
export const validatorNameSuffix = 'JoiValidator'


export namespace VirtualTypes {
    export interface Optional {}
}

//export tsDeclaration

async function processInterface(customProperties: CustomProperties, declaration: InterfaceDeclaration, validators) {
    const validator = await processTsDeclarationInterface(customProperties, declaration)
    validators[declaration.name + validatorNameSuffix] = validator

    const validatorJoi = processTsObject(validator)

    const updatedProperties: CustomProperties = {
        ...customProperties,
        existingInterfaces: {
            ...(customProperties.existingInterfaces || {}),
            [declaration.name]: validatorJoi
        }
    }

    return {updatedProperties, validator, validators}
}

export async function tsDeclarationToJoiValidator(tsThing: File, customProperties: CustomProperties = EmptyProperties) {
    let validators = {}
    let updatedProperties = customProperties

    const max = tsThing.declarations.length
    for (let i = 0; i < max; i++) {
        const declaration: Declaration = tsThing.declarations[i]

        /*
        instanceof type guards doesn't work when tsThing was imported from JSON
        */
        if ((declaration instanceof InterfaceDeclaration) || (declaration instanceof ClassDeclaration)) {
            ({updatedProperties, validators} = await processInterface(updatedProperties, declaration, validators))
            continue
        }

        // soft type guard
        if (typeof declaration == 'object') {
            ({updatedProperties, validators} = await processInterface(updatedProperties, <InterfaceDeclaration> declaration, validators))
            continue
        }

        //throw 'Joi validator for type "' + declaration + '" in declaration "' + declaration.name + '" notImplemented' // this only works when soft typeguard for 'object' is absent
        throw 'Joi validator for type "' + declaration + '" in declaration  notImplemented'
    }

    return {validators, updatedProperties}
}

async function convertParsedFilesToJoiValidators(customProperties: CustomProperties, parsedFiles) {
    let validators = []
    let updatedProperties = customProperties

    for (const item of parsedFiles) {
        let tmpValidators
        ({validators: tmpValidators, updatedProperties} = await tsDeclarationToJoiValidator(item, updatedProperties))
        validators.push(tmpValidators)
    }
    //const validators = await Promise.all(parsedFiles.map((item) => tsDeclarationToJoiValidator(item, customProperties)))




    // combine file results to one object
    const result = {}
    validators.forEach((fileResultObject) => {
        return Object.keys(fileResultObject).forEach(key => {
            if (result[key]) {
                // throw 'Multiple definition of "' + key + '" in selected files'
                console.warn('Multiple definition of "' + key + '" in selected files')
            }

            result[key] = fileResultObject[key]
        })
    })



    return result
}

async function loadTsDeclarations(files: string[]): Promise<File[]> {
    const processFile = (filePath) => parser.parseFile(filePath, workspaceRoot)
    const onError = (filePath) => (error) => {
        throw 'Error occured while preprocessing file "' + (filePath) + '": ' + error
    }


    let parsedFiles = await Promise.all(files.map((item) => processFile(item).catch(onError(item))))

    return parsedFiles
}

async function getFiles(globPath): Promise<string[]> {
    const globPathArray = globPath instanceof Array ? globPath : [globPath]
    const files = <string[]> await FastGlob(globPathArray)
    if (!files.length) {
        throw 'No files found'
    }

    return files
}

export interface BunchOfValidators {
    [key: string]: Joi.AnySchema
}

export async function exportTsDeclarations(globPath: string | string[]): Promise<string> {
    const files = await getFiles(globPath)
    const parsedFiles = await loadTsDeclarations(files)

    const result = JSON.stringify(parsedFiles)

    return result
}

export async function importTsDeclarationsToJoi(tsDeclarationJson: string, customProperties: CustomProperties = EmptyProperties): Promise<BunchOfValidators> {
    const tsDeclarations = <File[]> JSON.parse(tsDeclarationJson)

    const joiDefinitions = await convertParsedFilesToJoiValidators(customProperties, tsDeclarations)

    return joiDefinitions
}

// parse selected files and create Joi definitions for all interfaces/classes found
export async function generateJoiValidators(globPath: string, customProperties: CustomProperties = EmptyProperties): Promise<BunchOfValidators> {
    const files = await getFiles(globPath)
    const parsedFiles = await loadTsDeclarations(files)
    const joiDefinitions = await convertParsedFilesToJoiValidators(customProperties, parsedFiles)

    return joiDefinitions
}


/*
WARNING: import & export are not 'completely' inverse functions due to
https://github.com/hapijs/joi/issues/650
*/
/*
const joi2json = require('joi2json')
const joiToJsonSchema = require('joi-to-json-schema')
const enjoi = require('enjoi')

export function exportValidators(validators: BunchOfValidators): any {
    const describedJois = {}
    Object.keys(validators).forEach(key => {
        //describedJois[key] = validators[key].describe()
        describedJois[key] = joi2json.dejoi(validators[key])
        //describedJois[key] = JSON.stringify(validators[key])
        describedJois[key] = joiToJsonSchema(validators[key])

    })
//console.log('-.-----------------', describedJois)
    const result = JSON.stringify(describedJois)
    //const result = JSON.parse(JSON.stringify(describedJois))
    //const result = describedJois

    return result
}

export function importValidators(validatorsJson: string): BunchOfValidators {
    const describedJois = JSON.parse(validatorsJson)
    //const describedJois = validatorsJson

    const jois = {}
    Object.keys(describedJois).forEach(key => {
        //jois[key] = Joi.compile(describedJois[key])
        jois[key] = joi2json.enjoi(describedJois[key])
        //jois[key] = JSON.parse(describedJois[key])
        //jois[key] = enjoi(describedJois[key])
    })

    return jois
}
*/

