function Preprocessor(bundler, compiler, sharedProcessedFiles) {

    var coverage = require("karma-coverage/lib/preprocessor"),
        path = require("path"),

        log,
        config,
        excludeFromCoverage = /\.(d|spec|test)\.ts/,
        karmaTypescriptConfig,
        transformPath = function(filepath) {
            return filepath.replace(/\.(ts|tsx)$/, ".js");
        };

    function hasPreprocessor(name) {

        for(var preprocessor in config.preprocessors) {

            if(config.preprocessors[preprocessor] && config.preprocessors[preprocessor].indexOf(name) !== -1) {

                return true;
            }
        }

        return false;
    }

    function hasCoverageReporter() {

        return config.reporters.indexOf("coverage") !== -1;
    }

    function getReporterArray(){

        var reporters;

        if(config.reporters) {

            reporters = config.reporters.slice();

            if(!hasCoverageReporter()){

                reporters.push("coverage");
            }
        }
        else {

            reporters = ["coverage"];
        }

        return reporters;
    }

    function getCoverageReporterConfig() {

        return config.coverageReporter || {
            instrumenterOptions: {
                istanbul: { noCompact: true }
            }
        };
    }

    function createSourcemap(file, typescriptSource, emitOutput){

        var result = emitOutput.outputText,
            map,
            datauri;

        if(emitOutput.sourceMapText) {

            map = JSON.parse(emitOutput.sourceMapText);
            map.sources[0] = path.basename(file.originalPath);
            map.sourcesContent = [typescriptSource];
            map.file = path.basename(file.path);
            file.sourceMap = map;
            datauri = "data:application/json;charset=utf-8;base64," + new Buffer(JSON.stringify(map)).toString("base64");

            result = result.replace(
                "//# sourceMappingURL=" + path.basename(file.path) + ".map",
                "//# sourceMappingURL=" + datauri
            );
        }

        return result;
    }

    function instrumentSource(coveragePreprocessor, done, file, mappedSource) {

        sharedProcessedFiles[path.normalize(file.originalPath)] = mappedSource;

        if(hasPreprocessor("commonjs")) {

            log.debug("karma-commonjs already configured, done");
            done(null, mappedSource);
            return;
        }

        if(karmaTypescriptConfig.disableCodeCoverageInstrumentation || excludeFromCoverage.test(file.originalPath)) {

            log.debug("Excluding file %s from instrumentation, done", file.originalPath);
            done(null, mappedSource);
            return;
        }

        if(hasPreprocessor("coverage")) {

            log.debug("Karma-coverage already configured, done");
            done(null, mappedSource);
            return;
        }

        coveragePreprocessor(mappedSource, file, function(instrumentedResult){

            done(null, instrumentedResult);
        });
    }

    function enableBundling() {

        return compiler.getModuleFormat().toLowerCase() === "commonjs" &&
               compiler.getImportCount() > 0 &&
               !hasPreprocessor("commonjs");
    }

    function process(typescriptSource, file, done, coveragePreprocessor) {

        try {

            log.debug("Processing \"%s\".", file.originalPath);

            file.path = transformPath(file.originalPath);

            compiler.compile(file, function(emitOutput){

                var mappedSource = createSourcemap(file, typescriptSource, emitOutput);

                if(enableBundling()) {

                    bundler.bundle(file, mappedSource, emitOutput.importedModules, function(bundled){

                        instrumentSource(coveragePreprocessor, done, file, bundled);
                    });
                }
                else {

                    instrumentSource(coveragePreprocessor, done, file, mappedSource);
                }
            });
        }
        catch(e) {

            log.error("%s\n processing %s\n%s", e.message, file.originalPath, e.stack);
            done(e, null);
        }
    }

    var create = function(_config, helper, logger) {

        log = logger.create("preprocessor.karma-typescript");
        config = _config;
        karmaTypescriptConfig = config.karmaTypescriptConfig || {};

        var coveragePreprocessor = coverage(
                logger,
                helper,
                config.basePath,
                getReporterArray(),
                getCoverageReporterConfig()
            );

        excludeFromCoverage = karmaTypescriptConfig.excludeFromCoverage || excludeFromCoverage;
        transformPath = karmaTypescriptConfig.transformPath || transformPath;

        return function(typescriptSource, file, done){
            process(typescriptSource, file, done, coveragePreprocessor);
        };
    };

    this.create = create;
    this.create.$inject = ["config", "helper", "logger"];
}

module.exports = Preprocessor;