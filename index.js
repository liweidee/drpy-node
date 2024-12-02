import Fastify from 'fastify';
import * as drpy from './libs/drpyS.js';
import path from 'path';
import os from "os";
import {fileURLToPath} from 'url';
import {readdirSync,readFileSync} from 'fs';
import {base64Decode} from "./libs_drpy/crypto-util.js";
import {marked}  from './utils/marked.esm.min.js';

const fastify = Fastify({logger: true});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log('__dirname:', __dirname);

// 添加 / 接口
fastify.get('/', async (request, reply) => {
    const rootDir = path.resolve('.'); // 当前根目录
    let readmePath = null;

    // 查找根目录下的 README.md 文件（不区分大小写）
    const files = readdirSync(rootDir);
    for (const file of files) {
        if (/^readme\.md$/i.test(file)) {
            readmePath = path.join(rootDir, file);
            break;
        }
    }

    // 如果未找到 README.md 文件
    if (!readmePath) {
        reply.code(404).send('<h1>README.md not found</h1>');
        return;
    }

    // 读取 README.md 文件内容
    const markdownContent = readFileSync(readmePath, 'utf-8');

    // 将 Markdown 转换为 HTML
    const htmlContent = marked(markdownContent);

    // 返回 HTML 内容
    reply.type('text/html').send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>README</title>
                </head>
                <body>
                    ${htmlContent}
                </body>
                </html>
            `);
});

// 动态加载模块并根据 query 执行不同逻辑
fastify.get('/api/:module', async (request, reply) => {
    const moduleName = request.params.module;
    const query = request.query; // 获取 query 参数
    const modulePath = path.join(__dirname, 'js', `${moduleName}.js`);

    const pg = Number(query.pg) || 1;
    try {
        // 根据 query 参数决定执行逻辑
        if ('play' in query) {
            // 处理播放逻辑
            const result = await drpy.play(modulePath, query.flag, query.play);
            return reply.send(result);
        }

        if ('ac' in query && 't' in query) {
            let ext = query.ext;
            let extend = {};
            if (ext) {
                try {
                    extend = JSON.parse(base64Decode(ext))
                } catch (e) {
                }
            }
            // 分类逻辑
            const result = await drpy.cate(modulePath, query.t, pg, 1,extend);
            return reply.send(result);
        }

        if ('ac' in query && 'ids' in query) {
            // 详情逻辑
            const result = await drpy.detail(modulePath, query.ids.split(','));
            return reply.send(result);
        }

        if ('wd' in query) {
            // 搜索逻辑
            if (!('quick' in query)) {
                query.quick = 0
            }
            const result = await drpy.search(modulePath, query.wd, query.quick, pg);
            return reply.send(result);
        }

        if ('refresh' in query) {
            // 强制刷新初始化逻辑
            const refreshedObject = await drpy.init(modulePath, true);
            return reply.send(refreshedObject);
        }
        if (!('filter' in query)) {
            query.filter = 1
        }
        // 默认逻辑，返回 home + homeVod 接口
        const result_home = await drpy.home(modulePath, query.filter);
        const result_homeVod = await drpy.homeVod(modulePath);
        const result = {
            ...result_home,
            list: result_homeVod
        }
        reply.send(result);

    } catch (error) {
        console.error('Error processing request:', error);
        reply.status(500).send({error: `Failed to process request for module ${moduleName}: ${error.message}`});
    }
});

// 启动服务
const start = async () => {
    try {
        // 监听 0.0.0.0
        await fastify.listen({ port: 5757, host: '0.0.0.0' });

        // 获取本地地址
        const localAddress = `http://localhost:5757`;

        // 获取局域网地址
        const interfaces = os.networkInterfaces();
        let lanAddress = 'Not available';
        for (const iface of Object.values(interfaces)) {
            if (!iface) continue;
            for (const config of iface) {
                if (config.family === 'IPv4' && !config.internal) {
                    lanAddress = `http://${config.address}:5757`;
                    break;
                }
            }
        }

        // 打印服务地址
        console.log(`Server listening at:`);
        console.log(`- Local: ${localAddress}`);
        console.log(`- LAN:   ${lanAddress}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();