import {TypescriptParser, InterfaceDeclaration, PropertyDeclaration} from 'typescript-parser'
import * as Joi from 'joi'

const parser = new TypescriptParser()


export const EmptyProperties: CustomProperties = {types: {}, modifiers: {}}

export interface CustomProperties {
    types: {
        //[key: string]: {(rawType: string): Joi.AnySchema}
        [key: string]: {(...parameters: string[]): Promise<Joi.AnySchema>}
    }
    modifiers: {
        [key: string]: {(baseJoi: Joi.AnySchema, ...parameters: string[]): Promise<Joi.AnySchema>}
    },
    existingInterfaces?: {
        [key: string]: Joi.AnySchema
    }
}

export function processTsObject(objectGuts: any) {
    return Joi.object().keys(objectGuts)
}

async function processTsPropertyObject(customProperties: CustomProperties, rawType: string) {
    const tmpDefinition = 'export interface tmp ' + rawType
    const parsedTypes = await parser.parseSource(tmpDefinition)
    if (!parsedTypes || !parsedTypes.declarations || !parsedTypes.declarations[0]) {
        throw 'Unexpected error while processing declaration: "' + rawType + '"'
    }

    let result = await processTsDeclarationInterfaceInner(customProperties, <InterfaceDeclaration> parsedTypes.declarations[0])

    return result
}

const basicTypeValidators = {
    'any': Joi.any(),
    'string': Joi.string(),
    'number': Joi.number(),
    'boolean': Joi.boolean(),
    'Object': Joi.object(),
    'false': Joi.boolean(),
    'true': Joi.boolean(),
    'Date': Joi.date(),
}

async function processTsPropertyTypePrimitive(customProperties: CustomProperties, rawType: string) {
    // array of something
    if (rawType.endsWith('[]')) {
        const arrayRawType = rawType.replace('[]', '')
        const innerType = await processTsPropertyTypePrimitive(customProperties, arrayRawType)
        return Joi.array().items(innerType)
    }

    // arrow function
    if (rawType.includes('=>')) {
        return Joi.any()
    }

    if (basicTypeValidators[rawType]) {
        return basicTypeValidators[rawType]
    }

    const customTypeResult = await processTsPropertyCustomType(customProperties, rawType)
    if (typeof customTypeResult !== 'undefined') {
        return customTypeResult
    }

    throw 'Validator not implemented for TS type "' + rawType + '"'
}

async function processTsPropertyTypeExpression(customProperties: CustomProperties, rawType: string) {
    // parse type expression
    const [baseType, ...modifiers] = parseTypeExpression(rawType)

    // resolve type
    let joiValidator = await processTsPropertyTypePrimitive(customProperties, baseType)

    // apply modifiers
    joiValidator = await processTsPropertyModifiers(customProperties, modifiers, joiValidator)

    return joiValidator
}

function parseGenericTypeName(rawType: string): [string, string[]] {
    // check if generic type was passed (e.g. myCustomPropert<param1, param2>)
    const typeWithParamsRegex = /([^<]+)<(.+?)>/
    const matchResults = rawType.match(typeWithParamsRegex)
    if (matchResults === null) {
        return [rawType, []]
    }

    const name = matchResults[1] + '<>'
    const parameters = matchResults[2].split(',').map(item => item.trim())

    return [name, parameters]
}

// TODO: improve (read README.md)
// right now supports only expression like `myType` or `myType1 & myModifier1 & myModifier2 & ...`
function parseTypeExpression(rawType: string): string[] {
    return rawType.replace(/.\{\\n}/g, '').split('&').map(item => item.trim())
}

async function processTsPropertyCustomType(customProperties: CustomProperties, rawType: string) {
    const [name, parameters] = parseGenericTypeName(rawType)

    if (customProperties.types[name]) {
        return await customProperties.types[name](...parameters)
    }

    if (customProperties.existingInterfaces && customProperties.existingInterfaces[name]) {
        return customProperties.existingInterfaces[name]
    }

    return undefined
}

async function processTsPropertyType(customProperties: CustomProperties, rawType: string) {
    // TODO add modifiers support

    if (rawType.startsWith('[{') || (rawType.startsWith('{') && rawType.endsWith('}[]'))) { // array of objects
        return Joi.array()
        // TODO deeper definition
    }

    // TODO add modifiers support
    if (rawType.startsWith('{')) { // object
        return await processTsPropertyObject(customProperties, rawType)
    }

    return await processTsPropertyTypeExpression(customProperties, rawType)
}

// makes operations on object `joiValidatorForType`!
async function processTsPropertyCustomModifier(customProperties: CustomProperties, rawType: string, joiValidatorForType: Joi.AnySchema) {
    const [name, parameters] = parseGenericTypeName(rawType)

    if (customProperties.modifiers[name]) {
        return await customProperties.modifiers[name](joiValidatorForType, ...parameters)
    }

    return undefined
}

// makes operations on object `joiValidatorForType`!
async function processTsPropertyModifiers(customProperties: CustomProperties, rawTypes: string[], joiValidatorForType: Joi.AnySchema) {
    let customTypeResult = joiValidatorForType

    // no built-in property (type) modifiers right now
    ///////////////////////////////////////////


    // good old for loop is less complex than functional approach - it handles async better in this situation
    for (let i = 0; i < rawTypes.length; i++) {
        const tmp = await processTsPropertyCustomModifier(customProperties, rawTypes[i], customTypeResult)
        if (typeof tmp !== 'undefined') {
            customTypeResult = tmp
        }
    }

    return customTypeResult
}

async function processTsProperty(customProperties: CustomProperties, propertyDeclaration: PropertyDeclaration) {
    // parse types from string `rawType` like this: '{\n        email: string\n        password: string\n        account: string\n    }',
    const rawType = propertyDeclaration.type

    // resolve type
    let joiValidatorForType = await processTsPropertyType(customProperties, rawType)

    // apply required modifier when needed
    if (!propertyDeclaration.isOptional) {
        joiValidatorForType = joiValidatorForType.required()
    }

    return joiValidatorForType
}


export async function processTsDeclarationInterface(customProperties: CustomProperties, declaration: InterfaceDeclaration): Promise<Object> {
    const joiKeysObject = {}
    
    if (!declaration.properties) {
        return joiKeysObject
    }

    const promises = declaration.properties.map(async propertyDeclaration => {
        joiKeysObject[propertyDeclaration.name] = await processTsProperty(customProperties, propertyDeclaration)
    })

    await Promise.all(promises)

    return joiKeysObject
}

async function processTsDeclarationInterfaceInner(customProperties: CustomProperties, declaration: InterfaceDeclaration): Promise<Joi.AnySchema> {
    return processTsObject(await processTsDeclarationInterface(customProperties, declaration))
}
