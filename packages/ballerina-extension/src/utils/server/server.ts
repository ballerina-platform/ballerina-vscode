/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { delimiter, join } from 'path';
import { debug, log } from '../logger';
import { ServerOptions, ExecutableOptions } from 'vscode-languageclient/node';
import { isWindows } from '..';
import { BallerinaExtension } from '../../core';
import { isSupportedSLVersion, createVersionNumber, isWSL } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import { orderBy } from 'lodash';

interface JdkInfo {
    name: string;
    version: string;
    fullPath: string;
    parsedVersion: number[];
    buildNumber: number;
}

function findFileByPattern(directory: string, pattern: RegExp): string | null {
    try {
        if (!fs.existsSync(directory)) {
            return null;
        }
        const files = fs.readdirSync(directory);
        const matchingFile = files.find(file => pattern.test(file));
        return matchingFile ? path.join(directory, matchingFile) : null;
    } catch (error) {
        console.error(`Error reading directory ${directory}:`, error);
        return null;
    }
}

function findJarsExcludingPatterns(directory: string, excludePatterns: string[]): string[] {
    try {
        if (!fs.existsSync(directory)) {
            return [];
        }
        const files = fs.readdirSync(directory);
        const matchingJars: string[] = [];

        const compiledPatterns = excludePatterns.map(pattern => new RegExp(pattern.replace(/\*/g, '.*')));

        files.forEach(file => {
            if (file.endsWith('.jar')) {
                const shouldExclude = compiledPatterns.some(regex => regex.test(file));

                if (!shouldExclude) {
                    matchingJars.push(path.join(directory, file));
                }
            }
        });

        return matchingJars;
    } catch (error) {
        console.error(`Error reading directory ${directory}:`, error);
        return [];
    }
}

function parseJdkVersion(versionString: string): { parsedVersion: number[], buildNumber: number } {
    const [mainVersion, buildPart] = versionString.split('+');

    const parsedVersion = mainVersion
        .split('.')
        .map(num => parseInt(num, 10) || 0);

    const buildNumber = parseInt(buildPart || '0', 10);

    return { parsedVersion, buildNumber };
}

function extractJdkInfo(fileName: string, directory: string): JdkInfo | null {
    const jdkPattern = /^jdk-(.+)-jre$/;
    const match = fileName.match(jdkPattern);
    if (!match) {
        return null;
    }

    const versionString = match[1];
    const { parsedVersion, buildNumber } = parseJdkVersion(versionString);

    return {
        name: fileName,
        version: versionString,
        fullPath: path.join(directory, fileName),
        parsedVersion,
        buildNumber
    };
}

export function findHighestVersionJdk(directory: string): string | null {
    try {
        if (!fs.existsSync(directory)) {
            debug(`Dependencies directory not found: ${directory}`);
            return null;
        }

        const files = fs.readdirSync(directory);
        debug(`Found files in dependencies directory: ${files.join(', ')}`);

        const jdkInfos = files
            .map(file => extractJdkInfo(file, directory))
            .filter((jdk): jdk is JdkInfo => jdk !== null);

        if (jdkInfos.length === 0) {
            debug(`No JDK directories found matching pattern in: ${directory}`);
            // If no JDK directories found, check for system set jdk version by using JAVA_HOME environment variable
            // Try to find JAVA_HOME using environment variables on Windows, WSL, Ubuntu, or Mac
            let javaHome = process.env.JAVA_HOME;

            // For WSL, try to detect Linux JAVA_HOME if not found or is a windows path
            if ((!javaHome || javaHome.includes('\\')) && isWSL()) {
                try {
                    // Try to run 'bash -c "echo $JAVA_HOME"' to get the Linux side JAVA_HOME
                    const wslJavaHome = require('child_process').execSync('bash -c "echo $JAVA_HOME"', { encoding: 'utf8' }).trim();
                    if (wslJavaHome) {
                        debug(`Using WSL system set JDK from Linux environment: ${wslJavaHome}`);
                        return wslJavaHome;
                    }
                } catch (e) {
                    debug(`Could not get JAVA_HOME from WSL Linux environment: ${e}`);
                }
            }

            if (javaHome) {
                debug(`Using system set JDK: ${javaHome}`);
                return javaHome;
            }

            // Try some common fallback locations for Ubuntu / Mac
            const platform = process.platform;
            let commonJavaDirs: string[] = [];
            debug(`Detecting platform-specific common Java directories for platform: ${platform}`);

            if (platform === 'darwin') { // macOS
                debug('Platform is macOS. Checking default Java and SDKMAN directories.');
                commonJavaDirs = [
                    '/Library/Java/JavaVirtualMachines',
                    process.env.HOME ? `${process.env.HOME}/.sdkman/candidates/java/current` : ''
                ];
                debug(`Common Java directories for macOS: ${JSON.stringify(commonJavaDirs)}`);
            } else if (platform === 'linux' || isWSL()) { // Linux, also WSL
                debug('Platform is Linux or WSL. Checking standard Java and SDKMAN directories.');
                commonJavaDirs = [
                    '/usr/lib/jvm',
                    '/usr/java',
                    process.env.HOME ? `${process.env.HOME}/.sdkman/candidates/java/current` : ''
                ];
                debug(`Common Java directories for Linux/WSL: ${JSON.stringify(commonJavaDirs)}`);
            } else if (platform === 'win32') { // Windows
                debug('Platform is Windows. Checking ProgramFiles Java directories.');
                if (process.env['ProgramFiles']) {
                    debug(`Adding Java directory from ProgramFiles: ${process.env['ProgramFiles']}\\Java`);
                    commonJavaDirs.push(`${process.env['ProgramFiles']}\\Java`);
                }
                if (process.env['ProgramFiles(x86)']) {
                    debug(`Adding Java directory from ProgramFiles(x86): ${process.env['ProgramFiles(x86)']}\\Java`);
                    commonJavaDirs.push(`${process.env['ProgramFiles(x86)']}\\Java`);
                }
                debug(`Common Java directories for Windows: ${JSON.stringify(commonJavaDirs)}`);
            } else {
                debug(`Unknown or unsupported platform for Java directory detection: ${platform}`);
            }

            for (const dir of commonJavaDirs) {
                if (dir && fs.existsSync(dir)) {
                    // Check for JDK subdirectories
                    const subDirs = fs.readdirSync(dir);
                    for (const sub of subDirs) {
                        // JDK dir must contain bin/java[.exe]
                        const javaBin = platform === 'win32'
                            ? path.join(dir, sub, 'bin', 'java.exe')
                            : path.join(dir, sub, 'bin', 'java');
                        if (fs.existsSync(javaBin)) {
                            debug(`Found JDK in fallback directory: ${path.join(dir, sub)}`);
                            return path.join(dir, sub);
                        }
                    }
                }
            }
            debug(`No system set JDK found, returning null`);
            return null;
        }

        const sortedJdks = orderBy(jdkInfos, [
            // sort by major version (descending)
            (jdk: JdkInfo) => jdk.parsedVersion[0] || 0,
            // sort by minor version (descending)
            (jdk: JdkInfo) => jdk.parsedVersion[1] || 0,
            // sort by patch version (descending)
            (jdk: JdkInfo) => jdk.parsedVersion[2] || 0,
            // sort by build number (descending)
            (jdk: JdkInfo) => jdk.buildNumber
        ], ['desc', 'desc', 'desc', 'desc']);

        const highestVersionJdk = sortedJdks[0];

        debug(`Selected JDK: ${highestVersionJdk.name} at ${highestVersionJdk.fullPath}`);
        return highestVersionJdk.fullPath;

    } catch (error) {
        console.error(`Error reading directory ${directory}:`, error);
        return null;
    }
}

/** Minimum Java major version the bundled language server's class files can load on. */
export const REQUIRED_JDK_MAJOR_VERSION = 25;

/** The JDK the server would launch with: 'dependencies' sits beside 'distributions'. */
export function resolveLanguageServerJdkDir(extension: BallerinaExtension): string | null {
    const home = extension?.getBallerinaHome();
    if (!home) {
        return null;
    }
    const ballerinaHome = isWindows() ? fs.realpathSync.native(home) : home;
    const baseHome = ballerinaHome.includes('distributions')
        ? ballerinaHome.substring(0, ballerinaHome.indexOf('distributions'))
        : ballerinaHome;

    return findHighestVersionJdk(join(baseHome, 'dependencies'))
        ?? findHighestVersionJdk(join(path.dirname(baseHome), 'dependencies'));
}

/** Reads the 'release' file, so a JAVA_HOME fallback with non-standard naming also works. */
export function getJdkMajorVersion(jdkDir: string): number | null {
    try {
        const releaseFile = path.join(jdkDir, 'release');
        if (fs.existsSync(releaseFile)) {
            const match = fs.readFileSync(releaseFile, 'utf8').match(/^JAVA_VERSION="?([0-9]+)/m);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
        // Fall back to the directory name, e.g. 'jdk-25.0.4+1-jre'.
        const nameMatch = path.basename(jdkDir).match(/^jdk-([0-9]+)/);
        return nameMatch ? parseInt(nameMatch[1], 10) : null;
    } catch (error) {
        debug(`Could not determine the Java version of ${jdkDir}: ${error}`);
        return null;
    }
}

/** Only the bundled jar imposes a JRE requirement; the distribution's own server does not. */
export function usesBundledLanguageServer(extension: BallerinaExtension): boolean {
    const BI_SUPPORTED_MINIMUM_VERSION = createVersionNumber(2201, 12, 3); // Version 2201.12.3
    return !extension?.useDistributionLanguageServer()
        && isSupportedSLVersion(extension, BI_SUPPORTED_MINIMUM_VERSION);
}

export function getServerOptions(extension: BallerinaExtension): ServerOptions {
    debug('Getting server options.');
    // Check if user wants to use Ballerina CLI language server or if version requires it
    if (!usesBundledLanguageServer(extension)) {
        return getServerOptionsUsingCLI(extension);
    } else {
        return getServerOptionsUsingJava(extension);
    }
}

function getServerOptionsUsingCLI(extension: BallerinaExtension): ServerOptions {
    const ballerinaCmd = extension.getBallerinaCmd();
    debug(`Using bal command to start language server.`);
    debug(`Using Ballerina CLI command '${ballerinaCmd}'`);

    let cmd = isWindows() ? 'cmd.exe' : ballerinaCmd;
    let args = ["start-language-server"];
    if (isWindows()) {
        args = ['/c', ballerinaCmd, 'start-language-server'];
    }

    let opt: ExecutableOptions = {};
    opt.env = Object.assign({}, process.env);

    if (process.env.LS_EXTENSIONS_PATH !== "") {
        if (opt.env.BALLERINA_CLASSPATH_EXT) {
            opt.env.BALLERINA_CLASSPATH_EXT += delimiter + process.env.LS_EXTENSIONS_PATH;
        } else {
            opt.env.BALLERINA_CLASSPATH_EXT = process.env.LS_EXTENSIONS_PATH;
        }
    }

    if (process.env.LSDEBUG === "true" || extension?.enableLSDebug()) {
        debug('Language Server is starting in debug mode.');
        let debugPort = 5005;
        opt.env.BAL_JAVA_DEBUG = debugPort;
        opt.env.BAL_DEBUG_OPTS = `-Xdebug -Xnoagent -Djava.compiler=NONE -Xrunjdwp:transport=dt_socket,server=y,suspend=y,address=${debugPort},quiet=y`;
    }

    if (process.env.LS_CUSTOM_CLASSPATH) {
        args.push('--classpath', process.env.LS_CUSTOM_CLASSPATH);
    }

    // Add custom JVM arguments from environment variable ( Example: LS_CUSTOM_ARGS="-arg1 -arg2=value")
    if (process.env.LS_CUSTOM_ARGS) {
        debug(`LS_CUSTOM_ARGS: ${process.env.LS_CUSTOM_ARGS}`);
        args.push(...process.env.LS_CUSTOM_ARGS.split(' '));
    }

    return {
        command: cmd,
        args,
        options: opt
    };
}

function getServerOptionsUsingJava(extension: BallerinaExtension): ServerOptions {
    debug(`Using java command to start language server.`);
    let opt: ExecutableOptions = {};
    opt.env = Object.assign({}, process.env);

    if (process.env.LS_EXTENSIONS_PATH !== "") {
        if (opt.env.BALLERINA_CLASSPATH_EXT) {
            opt.env.BALLERINA_CLASSPATH_EXT += delimiter + process.env.LS_EXTENSIONS_PATH;
        } else {
            opt.env.BALLERINA_CLASSPATH_EXT = process.env.LS_EXTENSIONS_PATH;
        }
    }

    let debugOpts = '';
    if (process.env.LSDEBUG === "true" || extension?.enableLSDebug()) {
        let debugPort = 5005;
        debug(`Language Server is running in debug mode on port ${debugPort}`);
        debugOpts = `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${debugPort}`;
    }

    const ballerinaHome = isWindows() ? fs.realpathSync.native(extension?.getBallerinaHome()) : extension?.getBallerinaHome();
    // Get the base ballerina home by removing the distribution part
    const baseHome = ballerinaHome.includes('distributions')
        ? ballerinaHome.substring(0, ballerinaHome.indexOf('distributions'))
        : ballerinaHome;

    // jar patterns to exclude
    const excludeJarPatterns = [
        'architecture-model*',
        'flow-model*',
        'graphql-model*',
        'model-generator*',
        'sequence-model*',
        'service-model*',
        'test-manager-service*',
        'language-server*',
        "bal-shell-service*",
        "org.eclipse.lsp4j*",
        "diagram-util*",
        "openapi-ls-extension*",
        "sqlite-jdbc*"
    ];

    // Generate paths for ballerina home jars using dynamic discovery (excluding specified patterns)
    const directoriesToSearch = [
        join(ballerinaHome, 'bre', 'lib'),
        join(ballerinaHome, 'lib', 'tools', 'lang-server', 'lib'),
        join(ballerinaHome, 'lib', 'tools', 'debug-adapter', 'lib')
    ];

    const ballerinaJarPaths = directoriesToSearch.flatMap(directory =>
        findJarsExcludingPatterns(directory, excludeJarPatterns)
    );

    ballerinaJarPaths.forEach(jarPath => {
        if (!fs.existsSync(jarPath)) {
            debug(`Ballerina jar not found in ${jarPath}`);
            log(`Ballerina jar not found in ${jarPath}`);
        }
    });

    let ballerinaLanguageServerJar: string | null = null;
    const configuredLangServerPath = extension?.getConfiguredLangServerPath();

    if (configuredLangServerPath && configuredLangServerPath.trim() !== "") {
        debug(`Using custom language server path: ${configuredLangServerPath}`);
        // User provided custom language server path
        if (fs.existsSync(configuredLangServerPath)) {
            ballerinaLanguageServerJar = configuredLangServerPath;
        } else {
            debug(`Configured language server jar not found: ${configuredLangServerPath}`);
            throw new Error(`Configured language server JAR not found: ${configuredLangServerPath}`);
        }
    } else {
        debug(`Using bundled language server from ls directory.`);
        // Use bundled language server from ls directory
        const lsDir = extension?.context.asAbsolutePath("ls");
        ballerinaLanguageServerJar = findFileByPattern(lsDir, /^ballerina-language-server.*\.jar$/);

        if (!ballerinaLanguageServerJar || !fs.existsSync(ballerinaLanguageServerJar)) {
            debug(`No ballerina language server jar found in: ${lsDir}`);
            throw new Error(`Language server JAR not found in ${lsDir}`);
        }
    }

    const jarName = path.basename(configuredLangServerPath || ballerinaLanguageServerJar);
    debug(`Language Server JAR: ${jarName}`);
    const versionMatch = jarName.match(/ballerina-language-server-(.+)\.jar$/);
    if (versionMatch) {
        log(`Language Server Version: ${versionMatch[1]}`);
    } else {
        debug(`Language Server JAR: ${jarName}`);
    }

    const customPaths = [...ballerinaJarPaths, ballerinaLanguageServerJar];
    // debug(`Custom paths: ${customPaths}`);
    if (process.env.LS_CUSTOM_CLASSPATH) {
        debug(`LS_CUSTOM_CLASSPATH: ${process.env.LS_CUSTOM_CLASSPATH}`);
        customPaths.push(process.env.LS_CUSTOM_CLASSPATH);
    }

    const classpath = customPaths.join(delimiter);

    // Shared with the pre-flight check, so the JDK reported is the one actually used.
    const jdkDir = resolveLanguageServerJdkDir(extension);
    debug(`JDK Directory: ${jdkDir}`);

    if (!jdkDir) {
        const dependenciesDir = join(baseHome, 'dependencies');
        const parentDependenciesDir = join(path.dirname(baseHome), 'dependencies');
        debug(`No JDK found in dependencies directory: ${dependenciesDir} or parent dependencies directory: ${parentDependenciesDir}`);
        throw new Error(`JDK not found in ${dependenciesDir} or ${parentDependenciesDir}`);
    }

    const javaExecutable = isWindows() ? 'java.exe' : 'java';
    const cmd = join(jdkDir, 'bin', javaExecutable);
    const args = ['-cp', classpath, `-Dballerina.home=${ballerinaHome}`, 'org.ballerinalang.langserver.launchers.stdio.Main'];

    debug(`Java Executable: ${cmd}`);
    // Include debug options in the Java arguments if in debug mode
    if (debugOpts) {
        args.unshift(debugOpts);
    }
    debug(`Debug Options: ${debugOpts}`);
    // Add custom JVM arguments from environment variable ( Example: LS_CUSTOM_ARGS="-arg1 -arg2=value")
    if (process.env.LS_CUSTOM_ARGS) {
        debug(`LS_CUSTOM_ARGS: ${process.env.LS_CUSTOM_ARGS}`);
        args.unshift(...process.env.LS_CUSTOM_ARGS.split(' '));
    }

    const serverOptions = {
        command: cmd,
        args,
        options: opt
    };

    return serverOptions;
}
