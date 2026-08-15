import type { ImportableModule, ModuleManager as ModuleManagerI } from '@clerk/shared/moduleManager';
export declare class ModuleManager implements ModuleManagerI {
    #private;
    import(module: ImportableModule): any;
}
