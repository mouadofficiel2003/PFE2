package com.pfe.convocation.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Pool dédié à l'envoi parallèle des convocations (génération PDF + SMTP). */
@Configuration
public class ConvocationEnvoiConfig {

    @Bean(destroyMethod = "shutdown")
    public ExecutorService convocationEnvoiExecutor(
            @Value("${convocation.envoi.parallelism:3}") int parallelism) {
        int threads = Math.max(1, Math.min(parallelism, 32));
        return Executors.newFixedThreadPool(
                threads,
                r -> {
                    Thread t = new Thread(r, "convocation-envoi");
                    t.setDaemon(true);
                    return t;
                });
    }
}
